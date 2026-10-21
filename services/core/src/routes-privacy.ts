import { Hono } from "hono";
import { problem } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { libraryAdmin } from "./auth.ts";
import { json } from "./problem.ts";
import { now } from "./ids.ts";
import { deleteUnusedImages } from "./covers.ts";
import { readPhotos } from "./things.ts";

/**
 * A member's rights over their data, carried out by the library's admin: a
 * copy of everything held about them, and erasure. Both sit under
 * /v1/admin, so the moderation log records each one; both are the admin's
 * alone.
 */
export const privacy = new Hono<{ Bindings: Env }>();

/** What the library holds about one member, as one document to hand over. */
privacy.post("/v1/admin/members/:id/export", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const id = c.req.param("id");
	const db = c.env.DB;

	const member = await db
		.prepare(
			`SELECT m.id, m.email, m.display_name, m.locale, m.area_label, m.area_lat, m.area_lng,
			        m.meeting_place, m.meeting_note, m.lend_limit, m.away_until, m.browse_prefs, m.created_at,
			        m.invited_by, m.invited_via, m.last_seen_at,
			        ms.role, ms.status, ms.joined_at
			   FROM members m JOIN memberships ms ON ms.member_id = m.id AND ms.community_id = ?
			  WHERE m.id = ?`,
		)
		.bind(who.communityId, id)
		.first();
	if (!member) return json(c, problem(404, "Not a member"));

	const all = (sql: string, ...binds: unknown[]) =>
		db
			.prepare(sql)
			.bind(...binds)
			.all()
			.then((result) => result.results);

	const [
		copies,
		loans,
		reportsFiled,
		reportsAbout,
		replies,
		invites,
		waitlist,
		read,
		wished,
		availability,
		tokens,
		webhooks,
		devices,
		proposals,
		contact,
		messages,
		sessions,
		handoffs,
		moderation,
		invitedAt,
		waiting,
	] = await Promise.all([
		all(
			`SELECT c.id, e.title, c.condition, c.lending, c.state, c.note, c.created_at
			   FROM copies c JOIN editions e ON e.id = c.edition_id WHERE c.owner_id = ?`,
			id,
		),
		all(
			`SELECT l.id, e.title, l.status, l.message, l.requested_at, l.started_at, l.closed_at,
			        CASE WHEN l.borrower_id = ?1 THEN 'borrower' WHEN l.lender_id = ?1 THEN 'lender'
			             ELSE 'passed it on' END AS side
			   FROM loans l JOIN copies c ON c.id = l.copy_id JOIN editions e ON e.id = c.edition_id
			  WHERE l.borrower_id = ?1 OR l.lender_id = ?1 OR l.relay_from = ?1`,
			id,
		),
		all(
			"SELECT id, kind, body, status, resolution, created_at, closed_at FROM reports WHERE reporter_id = ?",
			id,
		),
		// That a report was made about them, and what came of it; not who made it.
		all(
			"SELECT kind, status, created_at, closed_at FROM reports WHERE subject_member = ?",
			id,
		),
		all(
			"SELECT report_id, body, created_at FROM report_replies WHERE author_id = ?",
			id,
		),
		all(
			"SELECT id, max_uses, uses, created_at, expires_at, revoked_at FROM invites WHERE created_by = ?",
			id,
		),
		all("SELECT work_id, created_at FROM waitlist WHERE member_id = ?", id),
		all(
			`SELECT r.work_id, w.title, r.created_at FROM read_works r
			   JOIN works w ON w.id = r.work_id WHERE r.member_id = ?`,
			id,
		),
		all(
			`SELECT l.work_id, w.title, l.created_at FROM wishlist l
			   JOIN works w ON w.id = l.work_id WHERE l.member_id = ?`,
			id,
		),
		all("SELECT weekday, period FROM availability WHERE member_id = ?", id),
		all(
			"SELECT client_name, scopes, created_at, last_used_at, revoked_at FROM access_tokens WHERE member_id = ?",
			id,
		),
		all("SELECT url, kinds, created_at FROM webhooks WHERE member_id = ?", id),
		all("SELECT created_at FROM push_subscriptions WHERE member_id = ?", id),
		all(
			"SELECT label, namespace_label, status, created_at FROM tag_proposals WHERE proposed_by = ?",
			id,
		),
		// Written signed in, or from their address while signed out.
		all(
			`SELECT topic, body, created_at FROM contact_messages
			  WHERE member_id = ?1 OR lower(email) = (SELECT lower(email) FROM members WHERE id = ?1)`,
			id,
		),
		c.env.CONVO.byAuthor(id),
		all(
			"SELECT created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE member_id = ?",
			id,
		),
		all(
			"SELECT loan_id, direction, day, period, status, created_at FROM handoffs WHERE proposed_by = ?",
			id,
		),
		// What moderators did as or about them: the action and when, not the
		// details, which can be about others.
		all(
			`SELECT action, created_at, CASE WHEN actor_id = ?1 THEN 'did' ELSE 'about them' END AS side
			   FROM moderation_log WHERE actor_id = ?1 OR target = ?1`,
			id,
		),
		all(
			`SELECT created_at, expires_at FROM invites
			  WHERE lower(sent_to) = (SELECT lower(email) FROM members WHERE id = ?)`,
			id,
		),
		all(
			"SELECT created_at, send_after FROM pending_emails WHERE member_id = ?",
			id,
		),
	]);

	return c.json({
		exportedAt: now(),
		member,
		copies,
		loans,
		messages,
		reportsFiled,
		reportsAbout,
		reportReplies: replies,
		invites,
		waitlist,
		booksRead: read,
		wishlist: wished,
		availability,
		connectedApps: tokens,
		webhooks,
		notificationDevices: devices.length,
		tagSuggestions: proposals,
		messagesToTheLibrary: contact,
		signIns: sessions,
		handoffsProposed: handoffs,
		moderation,
		invitationsReceived: invitedAt,
		emailsWaiting: waiting,
	});
});

/**
 * Forget a member. What identifies them goes (address, name, area, meeting
 * place, what they wrote, their devices, sessions and connected apps); the
 * bare fact that loans happened stays, with nobody's name on their side, so
 * the other members' history still adds up. Refused while a loan is open,
 * for oneself, and for an admin (make them a member first).
 */
privacy.post("/v1/admin/members/:id/erase", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const id = c.req.param("id");
	if (id === who.id) return json(c, problem(409, "Not yourself"));
	const body = (await c.req.json().catch(() => null)) as {
		confirm?: string;
	} | null;

	const member = await c.env.DB.prepare(
		`SELECT m.display_name, ms.role FROM members m
		   JOIN memberships ms ON ms.member_id = m.id AND ms.community_id = ?
		  WHERE m.id = ? AND m.deactivated_at IS NULL`,
	)
		.bind(who.communityId, id)
		.first<{ display_name: string; role: string }>();
	if (!member) return json(c, problem(404, "Not a member"));
	// Typed out, so a slip of the finger cannot forget somebody.
	if ((body?.confirm ?? "").trim() !== member.display_name.trim())
		return json(c, problem(422, "Confirm with their name"));
	if (member.role === "admin")
		return json(c, problem(409, "An admin", "Make them a member first"));
	const open = await c.env.DB.prepare(
		`SELECT count(*) AS n FROM loans
		  WHERE (borrower_id = ?1 OR lender_id = ?1 OR relay_from = ?1)
		    AND status IN ('requested', 'accepted', 'active')`,
	)
		.bind(id)
		.first<{ n: number }>();
	if (open?.n)
		return json(c, problem(409, "Loans open", "Settle their open loans first"));

	// What they wrote in loan threads goes first: if convo cannot be reached,
	// nothing here has changed yet and the erasure can be asked for again.
	const erasedMessages = await c.env.CONVO.eraseAuthor(id);

	const at = now();
	const db = c.env.DB;
	const erased = `erased-${id.toLowerCase()}@erased.invalid`;
	// Their items' pictures, which are public by address: photos, and the
	// picture of an edition only they list; each goes unless something else
	// shows the same image.
	const pictures = await db
		.prepare(
			`SELECT c.photos, CASE WHEN e.isbn13 IS NULL AND NOT EXISTS (
			          SELECT 1 FROM copies o WHERE o.edition_id = e.id AND o.owner_id != ?1)
			        THEN e.cover_url END AS cover_url
			   FROM copies c JOIN editions e ON e.id = c.edition_id WHERE c.owner_id = ?1`,
		)
		.bind(id)
		.all<{ photos: string | null; cover_url: string | null }>();
	await db.batch([
		// Before the address changes: sign-in links are kept by address, and
		// so are contact messages and invitations sent to it.
		db
			.prepare(
				"DELETE FROM magic_links WHERE email = (SELECT email FROM members WHERE id = ?)",
			)
			.bind(id),
		db
			.prepare(
				`UPDATE contact_messages SET body = '—', email = ?2
				  WHERE member_id = ?1 OR lower(email) = (SELECT lower(email) FROM members WHERE id = ?1)`,
			)
			.bind(id, erased),
		db
			.prepare(
				`UPDATE invites SET sent_to = NULL
				  WHERE id = (SELECT invited_via FROM members WHERE id = ?1)
				     OR lower(sent_to) = (SELECT lower(email) FROM members WHERE id = ?1)`,
			)
			.bind(id),
		db
			.prepare(
				`UPDATE moderation_log SET details = NULL
				  WHERE instr(lower(details), (SELECT lower(email) FROM members WHERE id = ?)) > 0`,
			)
			.bind(id),
		db.prepare("DELETE FROM pending_emails WHERE member_id = ?").bind(id),
		db.prepare("DELETE FROM loan_reads WHERE member_id = ?").bind(id),
		db
			.prepare(
				`UPDATE members SET email = ?, display_name = ?, area_lat = NULL, area_lng = NULL,
				        area_label = NULL, meeting_place = NULL, meeting_note = NULL, lend_limit = NULL, away_until = NULL,
				        deactivated_at = ?
				  WHERE id = ?`,
			)
			.bind(erased, "—", at, id),
		db
			.prepare("UPDATE memberships SET status = 'left' WHERE member_id = ?")
			.bind(id),
		db.prepare("DELETE FROM sessions WHERE member_id = ?").bind(id),
		db
			.prepare(
				"UPDATE access_tokens SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL",
			)
			.bind(at, id),
		db.prepare("DELETE FROM push_subscriptions WHERE member_id = ?").bind(id),
		db
			.prepare(
				"DELETE FROM webhook_deliveries WHERE webhook_id IN (SELECT id FROM webhooks WHERE member_id = ?)",
			)
			.bind(id),
		db.prepare("DELETE FROM webhooks WHERE member_id = ?").bind(id),
		db.prepare("DELETE FROM availability WHERE member_id = ?").bind(id),
		db.prepare("DELETE FROM waitlist WHERE member_id = ?").bind(id),
		db.prepare("DELETE FROM read_works WHERE member_id = ?").bind(id),
		db.prepare("DELETE FROM wishlist WHERE member_id = ?").bind(id),
		db
			.prepare(
				"UPDATE invites SET revoked_at = ? WHERE created_by = ? AND revoked_at IS NULL",
			)
			.bind(at, id),
		// Holds on their copies are lifted before the copies go.
		db
			.prepare(
				`UPDATE waitlist SET offered_copy_id = NULL, offer_expires_at = NULL
				  WHERE offered_copy_id IN (SELECT id FROM copies WHERE owner_id = ?)`,
			)
			.bind(id),
		// Every copy, retired before or now: what they wrote about their
		// things, and the photos of them.
		db
			.prepare(
				`UPDATE copies SET state = 'retired', note = NULL, details = NULL, photos = NULL, search_key = NULL
				  WHERE owner_id = ?`,
			)
			.bind(id),
		db
			.prepare(
				`UPDATE editions SET cover_url = NULL
				  WHERE isbn13 IS NULL AND id IN (SELECT edition_id FROM copies WHERE owner_id = ?1)
				    AND NOT EXISTS (SELECT 1 FROM copies o WHERE o.edition_id = editions.id AND o.owner_id != ?1)`,
			)
			.bind(id),
		db
			.prepare("UPDATE loans SET message = NULL WHERE borrower_id = ?")
			.bind(id),
		db.prepare("UPDATE reports SET body = NULL WHERE reporter_id = ?").bind(id),
		db
			.prepare("UPDATE report_replies SET body = '—' WHERE author_id = ?")
			.bind(id),
		db
			.prepare(
				"DELETE FROM tag_proposals WHERE proposed_by = ? AND status = 'pending'",
			)
			.bind(id),
	]);
	c.executionCtx.waitUntil(
		deleteUnusedImages(
			c.env,
			pictures.results.flatMap((row) => [
				...readPhotos(row.photos),
				row.cover_url,
			]),
		).catch((error: unknown) =>
			console.error("[privacy] images not deleted", error),
		),
	);
	return c.json({ erased: true, messages: erasedMessages });
});
