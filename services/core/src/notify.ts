import { tally } from "./tallies.ts";
import {
	NEWS_KINDS,
	REQUEST_HOLD_MINUTES,
	type LibraryType,
	type Message,
	type NewsKind,
	log,
} from "@cdl/contracts";
import type { Env, PushOutcome } from "./env.ts";
import { ulid, now } from "./ids.ts";

/** How long a push has to be noticed before the email goes out anyway. */
export const EMAIL_AFTER_MINUTES = 5;

/** Refusals in a row after which a browser is left out, and email goes instead. */
export const PUSH_REFUSALS = 5;

/** How long a new loan request waits before its owner hears of it. */
export const HOLD_MINUTES = REQUEST_HOLD_MINUTES;

/**
 * Hold the owner's notice of a new request, in the batch that writes it: only
 * once the loan is in, and gone with it. `sendHeldNotices` tells them later,
 * if it is still a request.
 */
export function holdNotice(
	env: Env,
	loanId: string,
	message: Message,
	minutes = HOLD_MINUTES,
) {
	return env.DB.prepare(
		`INSERT INTO held_notices (id, loan_id, message, send_at)
		 SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM loans WHERE id = ?2)`,
	).bind(ulid(), loanId, JSON.stringify(message), now() + minutes * 60);
}

/** Whether a loan is still a request its owner has not heard of yet. */
export async function stillHeld(env: Env, loanId: string): Promise<boolean> {
	const row = await env.DB.prepare(
		`SELECT 1 AS held FROM held_notices h JOIN loans l ON l.id = h.loan_id
		  WHERE h.loan_id = ? AND l.status = 'requested' LIMIT 1`,
	)
		.bind(loanId)
		.first<{ held: number }>();
	return Boolean(row);
}

/**
 * The held notices that are due. Each is claimed by deleting it, so two runs
 * at once send it once, and told only if its loan is still a request: one
 * taken back, accepted or declined meanwhile is dropped unsent.
 */
export async function sendHeldNotices(
	env: Env,
): Promise<{ sent: number; dropped: number }> {
	const { results } = await env.DB.prepare(
		`SELECT h.id, h.message, l.status
		   FROM held_notices h JOIN loans l ON l.id = h.loan_id
		  WHERE h.send_at <= ?
		  ORDER BY h.send_at LIMIT 100`,
	)
		.bind(now())
		.all<{ id: string; message: string; status: string }>();
	let sent = 0;
	let dropped = 0;
	for (const row of results) {
		const claimed = await env.DB.prepare(
			"DELETE FROM held_notices WHERE id = ?",
		)
			.bind(row.id)
			.run();
		if (!claimed.meta.changes) continue;
		if (row.status !== "requested") {
			dropped += 1;
			continue;
		}
		await tell(env, JSON.parse(row.message) as Message).catch(
			(error: unknown) => log.error("notify.held_notice_failed", {}, error),
		);
		sent += 1;
	}
	return { sent, dropped };
}

interface Subscription {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
}

/**
 * Tell a member something. A push reaches their phone at once; the email only
 * follows if they have not opened the app within a few minutes. Somebody with
 * no device registered gets the email straight away — waiting would only make
 * them slower to hear.
 */
export async function tell(
	env: Env,
	message: Message,
	deferMinutes = EMAIL_AFTER_MINUTES,
): Promise<void> {
	// What the library lends, so a message about a thing does not call it a book.
	const library = await env.DB.prepare("SELECT type FROM communities LIMIT 1")
		.first<{ type: LibraryType }>()
		.catch(() => null);
	message = { ...message, libraryType: library?.type ?? "books" } as Message;
	const member = await env.DB.prepare("SELECT id FROM members WHERE email = ?")
		.bind(message.to)
		.first<{ id: string }>();
	if (!member) {
		await sendNow(env, null, message);
		return;
	}
	await keepNotice(env, member.id, message);

	const { results } = await env.DB.prepare(
		`SELECT id, endpoint, p256dh, auth FROM push_subscriptions
		  WHERE member_id = ? AND failures < ?`,
	)
		.bind(member.id, PUSH_REFUSALS)
		.all<Subscription>();

	if (results.length === 0) {
		await sendNow(env, member.id, message);
		return;
	}

	const outcome = await env.NOTIFY.push(results, message).catch(
		(error: unknown): PushOutcome => {
			log.error("push.failed", {}, error);
			return { sent: 0, gone: [] };
		},
	);
	await countPushes(env, outcome);
	if (outcome.sent === 0) {
		await sendNow(env, member.id, message);
		return;
	}

	await env.DB.prepare(
		`INSERT INTO pending_emails (id, member_id, message, created_at, send_after)
		 VALUES (?, ?, ?, ?, ?)`,
	)
		.bind(
			ulid(),
			member.id,
			JSON.stringify(message),
			now(),
			now() + deferMinutes * 60,
		)
		.run();
}

/** How long a notice is kept as news: long enough for a member back from a holiday. */
export const NEWS_DAYS = 30;

/**
 * What a notice was about, for the member's assistant to say what is new
 * (routes-news.ts): its kind, the title, and the page that shows it. The
 * words somebody wrote, and their name, are not kept: the assistant reads
 * those where a member would, from the loan. Never throws: telling the
 * member matters more than remembering that we did.
 */
export async function keepNotice(
	env: Env,
	memberId: string,
	message: Message,
): Promise<void> {
	if (!(NEWS_KINDS as readonly string[]).includes(message.kind)) return;
	const about = message as Message & {
		kind: NewsKind;
		url?: string;
		bookTitle?: string | null;
	};
	try {
		await env.DB.prepare(
			`INSERT INTO notices (member_id, kind, detail, title, url, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
			.bind(
				memberId,
				about.kind,
				detailOf(message),
				about.bookTitle ?? null,
				about.url ?? null,
				now(),
			)
			.run();
	} catch (error) {
		log.error("notify.notice_not_kept", { kind: message.kind }, error);
	}
}

/** Which of its kind a notice was: the answer, the stage, what came of a report. */
function detailOf(message: Message): string | null {
	switch (message.kind) {
		case "loan_request":
			return message.relay ? "relay" : null;
		case "loan_decision":
			return message.accepted ? "accepted" : "declined";
		case "loan_nudge":
		case "loan_reminder":
		case "handoff":
			return message.stage;
		case "report":
			return message.reportKind;
		case "report_update":
			return message.event;
		default:
			return null;
	}
}

/**
 * A browser that threw its subscription away will not take another, so it
 * goes. One that refuses is counted, and left out after a few refusals in a
 * row; one that takes a push is forgiven its count.
 */
export async function countPushes(env: Env, outcome: PushOutcome) {
	await tally(env, "push_gone", outcome.gone.length);
	const statements = [
		...outcome.gone.map((id) =>
			env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id),
		),
		...(outcome.failed ?? []).map((id) =>
			env.DB.prepare(
				"UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?",
			).bind(id),
		),
		...(outcome.delivered ?? []).map((id) =>
			env.DB.prepare(
				"UPDATE push_subscriptions SET failures = 0 WHERE id = ? AND failures > 0",
			).bind(id),
		),
	];
	if (statements.length) await env.DB.batch(statements);
}

/**
 * The follow-up pass. Anything whose member looked at the app after it was
 * queued is dropped unsent: they have seen it, and a second telling is noise.
 *
 * `last_seen_at` is written at most once a minute, so it can lag by that much.
 * The lag can only make this send an email that was not needed, never swallow
 * one that was.
 */
export async function sendPendingEmails(
	env: Env,
): Promise<{ sent: number; dropped: number }> {
	const { results } = await env.DB.prepare(
		`SELECT p.id, p.member_id, p.message, p.created_at, p.attempts, m.last_seen_at
		   FROM pending_emails p JOIN members m ON m.id = p.member_id
		  WHERE p.send_after <= ?
		  ORDER BY p.send_after LIMIT 100`,
	)
		.bind(now())
		.all<{
			id: string;
			member_id: string;
			message: string;
			created_at: number;
			attempts: number;
			last_seen_at: number | null;
		}>();

	let sent = 0;
	let dropped = 0;
	for (const row of results) {
		const opened = (row.last_seen_at ?? 0) >= row.created_at;
		// Claimed by deleting it: two runs at once (the 08:00 and the
		// every-minute crons coincide) must not both send it, and its words
		// are not kept once it is sent or seen.
		const claimed = await env.DB.prepare(
			"DELETE FROM pending_emails WHERE id = ?",
		)
			.bind(row.id)
			.run();
		if (!claimed.meta.changes) continue;
		if (opened) {
			dropped += 1;
			continue;
		}
		await sendNow(
			env,
			row.member_id,
			JSON.parse(row.message) as Message,
			row.attempts,
		);
		sent += 1;
	}
	return { sent, dropped };
}

/** Tries before an email the service keeps failing to take is given up. */
const MAX_ATTEMPTS = 5;

/**
 * Send an email now. One the service could not take (unreachable, busy,
 * failing) is queued to be tried again, after 15 minutes, then 30, 60…,
 * rather than lost; one it refused (a bad address) is not. A member who opens
 * the app meanwhile has seen it there, and it is dropped like any follow-up.
 */
async function sendNow(
	env: Env,
	memberId: string | null,
	message: Message,
	attempts = 0,
) {
	const delivery = await env.NOTIFY.send(message).catch((error: unknown) => {
		log.error("email.send_failed", {}, error);
		return { delivered: false, channel: "email" as const, retry: true };
	});
	if (delivery.delivered || !delivery.retry || !memberId) return delivery;
	if (attempts + 1 >= MAX_ATTEMPTS) {
		log.error("email.given_up", { kind: message.kind });
		await tally(env, "email_given_up");
		return delivery;
	}
	await env.DB.prepare(
		`INSERT INTO pending_emails (id, member_id, message, created_at, send_after, attempts)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			ulid(),
			memberId,
			JSON.stringify(message),
			now(),
			now() + 15 * 60 * 2 ** attempts,
			attempts + 1,
		)
		.run();
	return delivery;
}
