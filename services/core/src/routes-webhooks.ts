import { Hono } from "hono";
import {
	CreateWebhook,
	EventsQuery,
	EVENT_KINDS,
	problem,
	type DeliveryView,
	type EventKind,
	type WebhookView,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewer, viewerWith } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { denied, json } from "./problem.ts";
import { newToken } from "./tokens.ts";
import { post } from "./events.ts";
import { publicTarget } from "./webhook-target.ts";

export const webhooks = new Hono<{ Bindings: Env }>();
webhooks.get("/v1/me/webhooks", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const { results } = await c.env.DB.prepare(
		`SELECT id, url, kinds, created_at, disabled_at, failures, last_status, last_at
		   FROM webhooks WHERE member_id = ? ORDER BY created_at DESC`,
	)
		.bind(member.id)
		.all<Row>();
	return c.json({ webhooks: results.map(view) });
});

webhooks.post("/v1/me/webhooks", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const parsed = CreateWebhook.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid webhook"));
	const url = new URL(parsed.data.url);
	if (!publicTarget(url.href, c.env.DEV_AUTH === "true"))
		return json(
			c,
			problem(422, "Invalid webhook", "A public https address only"),
		);
	const count = await c.env.DB.prepare(
		"SELECT count(*) AS n FROM webhooks WHERE member_id = ? AND disabled_at IS NULL",
	)
		.bind(member.id)
		.first<{ n: number }>();
	if ((count?.n ?? 0) >= 10)
		return json(c, problem(409, "Too many webhooks", "ten per member"));

	const id = ulid();
	const secret = `whsec_${newToken()}`;
	const kinds = parsed.data.kinds.length ? parsed.data.kinds.join(" ") : "*";
	await c.env.DB.prepare(
		`INSERT INTO webhooks (id, community_id, member_id, url, kinds, secret, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			member.communityId,
			member.id,
			url.toString(),
			kinds,
			secret,
			now(),
		)
		.run();
	const row = await c.env.DB.prepare(
		"SELECT id, url, kinds, created_at, disabled_at, failures, last_status, last_at FROM webhooks WHERE id = ?",
	)
		.bind(id)
		.first<Row>();
	return c.json({ ...view(row!), secret }, 201);
});

webhooks.delete("/v1/me/webhooks/:id", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const id = c.req.param("id");
	const result = await c.env.DB.batch([
		c.env.DB.prepare(
			"DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT id FROM webhooks WHERE id = ? AND member_id = ?)",
		).bind(id, member.id),
		c.env.DB.prepare(
			"DELETE FROM webhooks WHERE id = ? AND member_id = ?",
		).bind(id, member.id),
	]);
	return result[1]?.meta.changes
		? c.body(null, 204)
		: json(c, problem(404, "No such webhook"));
});

/** A `ping` straight to the URL, outside the delivery log; re-enables a switched-off hook on success. */
webhooks.post("/v1/me/webhooks/:id/test", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const hook = await c.env.DB.prepare(
		"SELECT url, secret FROM webhooks WHERE id = ? AND member_id = ?",
	)
		.bind(c.req.param("id"), member.id)
		.first<{ url: string; secret: string }>();
	if (!hook) return json(c, problem(404, "No such webhook"));
	const outcome = await post(
		hook.url,
		hook.secret,
		{
			id: ulid(),
			kind: "ping",
			data: { memberId: member.id },
			createdAt: now(),
		},
		c.env.DEV_AUTH === "true",
	);
	await c.env.DB.prepare(
		`UPDATE webhooks SET last_status = ?, last_at = ?, failures = CASE WHEN ? THEN 0 ELSE failures END,
		        disabled_at = CASE WHEN ? THEN NULL ELSE disabled_at END WHERE id = ?`,
	)
		.bind(
			outcome.status,
			now(),
			outcome.ok ? 1 : 0,
			outcome.ok ? 1 : 0,
			c.req.param("id"),
		)
		.run();
	return c.json({ ok: outcome.ok, status: outcome.status }, 202);
});

webhooks.get("/v1/me/webhooks/:id/deliveries", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));
	const { results } = await c.env.DB.prepare(
		`SELECT d.id, d.event_id, e.kind, d.status, d.attempts, d.next_at, d.last_status, d.last_error, d.created_at
		   FROM webhook_deliveries d JOIN events e ON e.id = d.event_id
		   JOIN webhooks w ON w.id = d.webhook_id
		  WHERE d.webhook_id = ? AND w.member_id = ? ORDER BY d.created_at DESC LIMIT 20`,
	)
		.bind(c.req.param("id"), member.id)
		.all<{
			id: string;
			event_id: string;
			kind: string;
			status: DeliveryView["status"];
			attempts: number;
			next_at: number;
			last_status: number | null;
			last_error: string | null;
			created_at: number;
		}>();
	return c.json({
		deliveries: results.map((row): DeliveryView => ({
			id: row.id,
			eventId: row.event_id,
			kind: row.kind,
			status: row.status,
			attempts: row.attempts,
			nextAt: row.next_at,
			lastStatus: row.last_status,
			lastError: row.last_error,
			createdAt: row.created_at,
		})),
	});
});

/** Replay: everything the member may see, oldest first from a cursor. */
webhooks.get("/v1/events", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const parsed = EventsQuery.safeParse({
		since: c.req.query("since"),
		limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
	});
	if (!parsed.success) return json(c, problem(422, "Invalid query"));
	// In the order events were written, not by id: two written at once can
	// land out of id order, and a cursor on ids would skip the lower one. The
	// cursor is still an event id; one pruned since is placed by its id.
	const { results } = await c.env.DB.prepare(
		`SELECT id, kind, data, created_at FROM events
		  WHERE community_id = ?1
		    AND rowid > coalesce((SELECT rowid FROM events WHERE id = ?2),
		                         (SELECT max(rowid) FROM events WHERE id < ?2), 0)
		    AND (audience = '*' OR instr(audience, ?3) > 0)
		  ORDER BY rowid LIMIT ?4`,
	)
		.bind(
			member.communityId,
			parsed.data.since ?? "",
			`"${member.id}"`,
			parsed.data.limit + 1,
		)
		.all<{ id: string; kind: string; data: string; created_at: number }>();
	const page = results.slice(0, parsed.data.limit);
	return c.json({
		events: page.map((row) => ({
			id: row.id,
			kind: row.kind,
			data: JSON.parse(row.data) as Record<string, unknown>,
			createdAt: row.created_at,
		})),
		next: results.length > parsed.data.limit ? page[page.length - 1]!.id : null,
	});
});

interface Row {
	id: string;
	url: string;
	kinds: string;
	created_at: number;
	disabled_at: number | null;
	failures: number;
	last_status: number | null;
	last_at: number | null;
}

function view(row: Row): WebhookView {
	return {
		id: row.id,
		url: row.url,
		kinds:
			row.kinds === "*"
				? [...EVENT_KINDS]
				: (row.kinds
						.split(" ")
						.filter((k): k is EventKind =>
							(EVENT_KINDS as readonly string[]).includes(k),
						) as EventKind[]),
		createdAt: row.created_at,
		disabledAt: row.disabled_at,
		failures: row.failures,
		lastStatus: row.last_status,
		lastAt: row.last_at,
	};
}
