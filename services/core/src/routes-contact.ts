import { Hono } from "hono";
import {
	ContactRequest,
	problem,
	type ContactMessagePage,
	type ContactMessageView,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { libraryAdmin, viewer } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { tell } from "./notify.ts";
import { denied, json, tooMany } from "./problem.ts";
import { callerIp, take } from "./rate-limit.ts";

export const contact = new Hono<{ Bindings: Env }>();

/**
 * Writing to whoever runs the library: feedback, a data request, a complaint.
 * Open without a session, because somebody asking for their data to be deleted
 * may no longer have one — and because a complaint should never depend on
 * being able to get in. It is kept as well as sent: a data request has a month
 * to be answered, and an inbox is not a record.
 *
 * Moderators do not see these. A complaint may be about a moderator. The
 * library's admin reads them, a page at a time, below.
 */
contact.post("/v1/contact", async (c) => {
	const parsed = ContactRequest.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid message"));
	const { topic, body } = parsed.data;

	const who = await viewer(c).catch(() => null);
	// An assistant writes in its member's name only with leave to write to
	// people: a read-only token cannot file a data request for them.
	if (who && !who.session && !who.scopes.includes("messages:write"))
		return denied(c, true);
	const member = who
		? await c.env.DB.prepare(
				"SELECT email, display_name, locale FROM members WHERE id = ?",
			)
				.bind(who.id)
				.first<{ email: string; display_name: string; locale: "en" | "he" }>()
		: null;
	const email = member?.email ?? parsed.data.email;
	if (!email) {
		return json(
			c,
			problem(422, "No address", "Give an address we can answer on"),
		);
	}

	// It sends mail to an address the caller names, so it is limited like the
	// sign-in link, and the limit is told to whoever hit it.
	const perCaller = await take(c.env, {
		bucket: "contact:ip",
		subject: callerIp(c.req.raw),
		allow: 5,
		per: 60 * 60,
	});
	if (!perCaller.ok) {
		return tooMany(
			c,
			"Too many messages",
			"Five in an hour is the limit. What you wrote is not lost — try again shortly.",
			perCaller.retryAfter,
		);
	}

	const id = ulid();
	await c.env.DB.prepare(
		`INSERT INTO contact_messages (id, member_id, community_id, email, topic, body, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			id,
			who?.id ?? null,
			who?.communityId ?? null,
			email,
			topic,
			body,
			now(),
		)
		.run();

	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "contact",
			to: c.env.CONTACT_ADDRESS,
			locale: member?.locale ?? "en",
			topic,
			fromEmail: email,
			fromName: member?.display_name ?? null,
			body,
		}).catch((error: unknown) =>
			console.error("[contact] notify failed", error),
		),
	);

	return c.json({ id }, 201);
});

const PAGE = 20;

/** Every message to the library from this community (and from visitors), newest first. */
contact.get("/v1/admin/contact", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
	const scope = "WHERE (cm.community_id = ?1 OR cm.community_id IS NULL)";
	const [count, rows, data] = await Promise.all([
		c.env.DB.prepare(`SELECT count(*) AS n FROM contact_messages cm ${scope}`)
			.bind(who.communityId)
			.first<{ n: number }>(),
		c.env.DB.prepare(
			`SELECT cm.id, cm.topic, cm.body, cm.email, cm.created_at, cm.handled_at,
			        m.id AS member_id, m.display_name
			   FROM contact_messages cm LEFT JOIN members m ON m.id = cm.member_id
			   ${scope}
			  ORDER BY cm.created_at DESC, cm.id DESC
			  LIMIT ?2 OFFSET ?3`,
		)
			.bind(who.communityId, PAGE, (page - 1) * PAGE)
			.all<{
				id: string;
				topic: ContactMessageView["topic"];
				body: string;
				email: string;
				created_at: number;
				handled_at: number | null;
				member_id: string | null;
				display_name: string | null;
			}>(),
		c.env.DB.prepare(
			`SELECT count(*) AS n, min(cm.created_at) AS oldest FROM contact_messages cm
			   ${scope} AND cm.topic = 'data' AND cm.handled_at IS NULL`,
		)
			.bind(who.communityId)
			.first<{ n: number; oldest: number | null }>(),
	]);
	const total = count?.n ?? 0;
	const list: ContactMessagePage = {
		dataRequests: { open: data?.n ?? 0, oldestAt: data?.oldest ?? null },
		page,
		pages: Math.max(1, Math.ceil(total / PAGE)),
		total,
		messages: rows.results.map((row) => ({
			id: row.id,
			topic: row.topic,
			body: row.body,
			email: row.email,
			member: row.member_id
				? { id: row.member_id, displayName: row.display_name ?? "" }
				: null,
			createdAt: row.created_at,
			handledAt: row.handled_at,
		})),
	};
	return c.json(list);
});

/** Marked as dealt with, or opened again. */
contact.post("/v1/admin/contact/:id/:action", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const action = c.req.param("action");
	if (action !== "handled" && action !== "reopen")
		return json(c, problem(404, "No such action"));
	const result = await c.env.DB.prepare(
		`UPDATE contact_messages SET handled_at = ?
		  WHERE id = ? AND (community_id = ? OR community_id IS NULL)`,
	)
		.bind(
			action === "handled" ? now() : null,
			c.req.param("id"),
			who.communityId,
		)
		.run();
	return result.meta.changes
		? c.body(null, 204)
		: json(c, problem(404, "No such message"));
});
