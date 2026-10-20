import type { EventKind } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";

/** Retry schedule in seconds; the fifth miss spends the delivery. */
const BACKOFF = [60, 900, 3600, 21_600, 86_400];
const MAX_ATTEMPTS = BACKOFF.length;
/** Consecutive failures that switch a hook off; its owner sees why on /connect. */
const DISABLE_AFTER = 25;
const TIMEOUT_MS = 10_000;
/** How long a claimed delivery stays out of other passes' reach. */
const LEASE_SECONDS = 120;

/**
 * Something happened. Record it, fan it out to subscribed hooks, and try the
 * first delivery straight away. Callers name a loan or a copy; the audience
 * (who may see the event) and the ids in the payload follow from that.
 * Never throws: an event is a side effect of a change that already happened.
 */
export async function emit(
	env: Env,
	ctx: { waitUntil(promise: Promise<unknown>): void },
	kind: EventKind,
	subject: { loanId: string } | { copyId: string },
	extra: Record<string, unknown> = {},
): Promise<void> {
	try {
		const resolved =
			"loanId" in subject
				? await forLoan(env, subject.loanId)
				: await forCopy(env, subject.copyId);
		if (!resolved) return;
		const id = ulid();
		const data = { ...resolved.data, ...extra };
		const audience =
			resolved.audience === "*" ? "*" : JSON.stringify(resolved.audience);
		await env.DB.prepare(
			"INSERT INTO events (id, community_id, kind, data, audience, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		)
			.bind(
				id,
				resolved.communityId,
				kind,
				JSON.stringify(data),
				audience,
				now(),
			)
			.run();

		const hooks = await env.DB.prepare(
			// Only members still in the community hear what happens in it.
			`SELECT w.id, w.member_id, w.kinds FROM webhooks w
			   JOIN memberships ms ON ms.member_id = w.member_id
			    AND ms.community_id = w.community_id AND ms.status = 'active'
			   JOIN members m ON m.id = w.member_id AND m.deactivated_at IS NULL
			  WHERE w.community_id = ? AND w.disabled_at IS NULL`,
		)
			.bind(resolved.communityId)
			.all<{ id: string; member_id: string; kinds: string }>();
		const due = hooks.results.filter(
			(hook) =>
				(hook.kinds === "*" || hook.kinds.split(" ").includes(kind)) &&
				(resolved.audience === "*" ||
					resolved.audience.includes(hook.member_id)),
		);
		if (due.length === 0) return;
		await env.DB.batch(
			due.map((hook) =>
				env.DB.prepare(
					"INSERT INTO webhook_deliveries (id, webhook_id, event_id, status, next_at, created_at) VALUES (?, ?, ?, 'pending', ?, ?)",
				).bind(ulid(), hook.id, id, now(), now()),
			),
		);
		ctx.waitUntil(deliverPending(env).catch(() => undefined));
	} catch (error) {
		console.error("[events] emit failed", kind, error);
	}
}

async function forLoan(env: Env, loanId: string) {
	const row = await env.DB.prepare(
		`SELECT l.community_id, l.copy_id, l.borrower_id, l.lender_id, l.relay_from, l.status, l.outcome, l.started_at, e.work_id
		   FROM loans l JOIN copies c ON c.id = l.copy_id JOIN editions e ON e.id = c.edition_id
		  WHERE l.id = ?`,
	)
		.bind(loanId)
		.first<{
			community_id: string;
			copy_id: string;
			borrower_id: string;
			lender_id: string;
			relay_from: string | null;
			status: string;
			outcome: string | null;
			started_at: number | null;
			work_id: string;
		}>();
	if (!row) return null;
	return {
		communityId: row.community_id,
		// The reader before, on a relay, until they have handed it on: after
		// that the loan is none of their business.
		audience: [
			row.borrower_id,
			row.lender_id,
			row.started_at === null ? row.relay_from : null,
		].filter((id): id is string => Boolean(id)),
		data: {
			loanId,
			copyId: row.copy_id,
			workId: row.work_id,
			borrowerId: row.borrower_id,
			lenderId: row.lender_id,
			status: row.status,
			...(row.outcome ? { outcome: row.outcome } : {}),
		},
	};
}

async function forCopy(env: Env, copyId: string) {
	const row = await env.DB.prepare(
		`SELECT cs.community_id, c.owner_id, c.state, e.work_id
		   FROM copies c JOIN copy_shares cs ON cs.copy_id = c.id JOIN editions e ON e.id = c.edition_id
		  WHERE c.id = ? LIMIT 1`,
	)
		.bind(copyId)
		.first<{
			community_id: string;
			owner_id: string;
			state: string;
			work_id: string;
		}>();
	if (!row) return null;
	// The catalogue is visible to the whole community, so are its events.
	return {
		communityId: row.community_id,
		audience: "*" as const,
		data: {
			copyId,
			workId: row.work_id,
			ownerId: row.owner_id,
			state: row.state,
		},
	};
}

interface Due {
	id: string;
	webhook_id: string;
	event_id: string;
	attempts: number;
	url: string;
	secret: string;
	failures: number;
	kind: string;
	data: string;
	created_at: number;
}

/** Push every due delivery once. Called after emit and every 15 minutes by cron. */
export async function deliverPending(env: Env, limit = 25): Promise<number> {
	const { results } = await env.DB.prepare(
		`SELECT d.id, d.webhook_id, d.event_id, d.attempts, w.url, w.secret, w.failures,
		        e.kind, e.data, e.created_at
		   FROM webhook_deliveries d
		   JOIN webhooks w ON w.id = d.webhook_id
		   JOIN events e ON e.id = d.event_id
		  WHERE d.status = 'pending' AND d.next_at <= ? AND w.disabled_at IS NULL
		  ORDER BY d.next_at LIMIT ?`,
	)
		.bind(now(), limit)
		.all<Due>();
	let sent = 0;
	for (const due of results) {
		// Two passes can overlap (each emit starts one); a short lease keeps a
		// delivery with whoever claimed it first. At-least-once still holds.
		const claimed = await env.DB.prepare(
			"UPDATE webhook_deliveries SET next_at = ? WHERE id = ? AND status = 'pending' AND next_at <= ?",
		)
			.bind(now() + LEASE_SECONDS, due.id, now())
			.run();
		if (!claimed.meta.changes) continue;
		const outcome = await post(due.url, due.secret, {
			id: due.event_id,
			kind: due.kind,
			data: JSON.parse(due.data) as unknown,
			createdAt: due.created_at,
		});
		const attempts = due.attempts + 1;
		const done = outcome.ok || attempts >= MAX_ATTEMPTS;
		const statements = [
			env.DB.prepare(
				`UPDATE webhook_deliveries
				    SET status = ?, attempts = ?, next_at = ?, last_status = ?, last_error = ?
				  WHERE id = ?`,
			).bind(
				outcome.ok ? "delivered" : done ? "failed" : "pending",
				attempts,
				now() + (BACKOFF[attempts - 1] ?? 0),
				outcome.status,
				outcome.error,
				due.id,
			),
			env.DB.prepare(
				`UPDATE webhooks SET failures = ?, last_status = ?, last_at = ?, disabled_at = ? WHERE id = ?`,
			).bind(
				outcome.ok ? 0 : due.failures + 1,
				outcome.status,
				now(),
				!outcome.ok && due.failures + 1 >= DISABLE_AFTER ? now() : null,
				due.webhook_id,
			),
		];
		await env.DB.batch(statements);
		if (outcome.ok) sent += 1;
	}
	return sent;
}

/** A signed POST. Signature: HMAC-SHA256 of `${timestamp}.${body}` with the hook's secret. */
export async function post(
	url: string,
	secret: string,
	event: { id: string; kind: string; data: unknown; createdAt: number },
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
	const body = JSON.stringify(event);
	const timestamp = String(now());
	const signature = await sign(secret, `${timestamp}.${body}`);
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"user-agent": "cdl-webhooks/1",
				"x-cdl-event": event.kind,
				"x-cdl-delivery": event.id,
				"x-cdl-signature": `t=${timestamp},v1=${signature}`,
			},
			body,
			signal: AbortSignal.timeout(TIMEOUT_MS),
			redirect: "manual",
		});
		return {
			ok: response.status >= 200 && response.status < 300,
			status: response.status,
			error: null,
		};
	} catch (error) {
		return {
			ok: false,
			status: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function sign(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(message),
	);
	return [...new Uint8Array(mac)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
