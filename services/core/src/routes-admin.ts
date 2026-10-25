import { Hono } from "hono";
import { matchedRoutes } from "hono/route";
import {
	CloseLoan,
	CreateInvite,
	EmailInvite,
	HOUSE_ACCENT,
	LibrarySettings,
	SetRole,
	SetStatus,
	problem,
	type AdminLoanPage,
	type LibraryType,
	type AdminMemberDetail,
	type LogPage,
	type MemberReport,
} from "@cdl/contracts";
import {
	BACK_WITH_OWNER,
	endWaitingRelays,
	markLost,
	relaysEnded,
	waitingRelays,
} from "./sets.ts";
import type { Env } from "./env.ts";
import { libraryAdmin, moderator, viewer } from "./auth.ts";
import { createInvite } from "./invites.ts";
import { createMagicLink } from "./sessions.ts";
import { take } from "./rate-limit.ts";
import { attention } from "./reminders.ts";
import { emit } from "./events.ts";
import { backup } from "./backup.ts";
import { forget, vocabularyKey } from "./cache.ts";
import { json } from "./problem.ts";
import { describe, record } from "./audit.ts";

import type { Viewer } from "./auth.ts";
import { now, ulid } from "./ids.ts";
import { containing, searchKey } from "./normalise.ts";
import { dropStaleHandoffs } from "./stale-handoffs.ts";
import { onCopyAvailable, releaseHolds } from "./waitlist.ts";
import { readTexts } from "./library.ts";
import { resolvePlace } from "./places.ts";

export const admin = new Hono<{
	Bindings: Env;
	Variables: { moderator: Viewer };
}>();

/** 401 for strangers, 403 for members — moderators only past this point. */
admin.use("/v1/admin/*", async (c, next) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.scopes.includes("admin"))
		return json(c, problem(403, "Scope missing"));
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	c.set("moderator", who);
	// Changes are logged: what was asked (the body, cut short) and by whom.
	const writes = c.req.method !== "GET" && c.req.method !== "HEAD";
	const details = writes
		? await c.req.raw
				.clone()
				.text()
				.catch(() => "")
		: "";
	await next();
	if (writes && c.res.status < 300) {
		// The route that handled it, not this middleware's own "/v1/admin/*".
		const handler = matchedRoutes(c)
			.filter((route) => route.method !== "ALL")
			.at(-1);
		const { action, target } = describe(
			c.req.method,
			handler?.path ?? new URL(c.req.url).pathname,
			new URL(c.req.url).pathname,
		);
		// Written before the answer goes: a change nobody can trace is not allowed
		// to look done.
		await record(c.env, {
			communityId: who.communityId,
			actorId: who.id,
			via: who.client,
			action,
			target,
			// An erasure's confirmation is the person's name, and an emailed
			// invitation's body their address: neither is kept.
			details:
				action.endsWith("/erase") || action === "POST /v1/admin/invites/email"
					? null
					: details || null,
		}).catch((error: unknown) =>
			console.error("[audit] could not record", error),
		);
	}
});

admin.get("/v1/admin/stats", async (c) => {
	const who = c.get("moderator");
	const row = await c.env.DB.prepare(
		`SELECT co.name,
		        (SELECT count(*) FROM memberships WHERE community_id = co.id AND status = 'active') AS members,
		        (SELECT count(*) FROM memberships WHERE community_id = co.id AND status = 'active' AND role IN ('moderator', 'admin')) AS moderators,
		        (SELECT count(*) FROM copy_shares cs JOIN copies c ON c.id = cs.copy_id
		          WHERE cs.community_id = co.id AND c.state != 'retired') AS copies,
		        (SELECT count(*) FROM copy_shares cs JOIN copies c ON c.id = cs.copy_id
		          WHERE cs.community_id = co.id AND c.state = 'shelved' AND c.lending = 'lendable') AS lendable,
		        (SELECT count(*) FROM invites WHERE community_id = co.id AND revoked_at IS NULL
		            AND expires_at > ? AND uses < max_uses) AS activeInvites,
		        (SELECT count(*) FROM loans WHERE community_id = co.id AND status = 'active') AS activeLoans
		   FROM communities co WHERE co.id = ?`,
	)
		.bind(now(), who.communityId)
		.first();
	return c.json(row);
});

const LOANS_PAGE = 30;

/**
 * The community's loans for the moderators: who has what, since when, and
 * until when. Open ones by default (asked for, agreed, out), soonest due
 * first; "all" adds those that have ended, newest first. No conversations:
 * a moderator reads one only through a report.
 */
admin.get("/v1/admin/loans", async (c) => {
	const who = c.get("moderator");
	const all = c.req.query("status") === "all";
	const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
	const scope = `FROM loans l
	   JOIN copies c ON c.id = l.copy_id
	   JOIN editions e ON e.id = c.edition_id
	   JOIN members o ON o.id = l.lender_id
	   JOIN members b ON b.id = l.borrower_id
	  WHERE l.community_id = ?1
	    ${all ? "" : "AND l.status IN ('requested', 'accepted', 'active')"}`;
	const [count, rows] = await Promise.all([
		c.env.DB.prepare(`SELECT count(*) AS n ${scope}`)
			.bind(who.communityId)
			.first<{ n: number }>(),
		c.env.DB.prepare(
			`SELECT l.id, l.status, l.requested_at, l.started_at, l.due_at, l.closed_at,
			        e.work_id, e.title, o.id AS lender_id, o.display_name AS lender_name,
			        b.id AS borrower_id, b.display_name AS borrower_name
			   ${scope}
			  ORDER BY (l.status IN ('requested', 'accepted', 'active')) DESC,
			           coalesce(l.due_at, l.requested_at) ${all ? "DESC" : "ASC"}, l.id
			  LIMIT ?2 OFFSET ?3`,
		)
			.bind(who.communityId, LOANS_PAGE, (page - 1) * LOANS_PAGE)
			.all<{
				id: string;
				status: string;
				requested_at: number;
				started_at: number | null;
				due_at: number | null;
				closed_at: number | null;
				work_id: string;
				title: string;
				lender_id: string;
				lender_name: string;
				borrower_id: string;
				borrower_name: string;
			}>(),
	]);
	const total = count?.n ?? 0;
	const list: AdminLoanPage = {
		page,
		pages: Math.max(1, Math.ceil(total / LOANS_PAGE)),
		total,
		loans: rows.results.map((row) => ({
			id: row.id,
			status: row.status,
			book: { workId: row.work_id, title: row.title },
			lender: { id: row.lender_id, displayName: row.lender_name },
			borrower: { id: row.borrower_id, displayName: row.borrower_name },
			requestedAt: row.requested_at,
			startedAt: row.started_at,
			dueAt: row.due_at,
			closedAt: row.closed_at,
		})),
	};
	return c.json(list);
});

/** The overview's "needs a human" list. */
/**
 * Settle a loan whose borrower, owner or handing-on reader was suspended:
 * nobody can reach that member, so the moderators close it. Before the
 * handover it is called off; after it, the book came back or is gone. Only
 * such loans: every other loan stays between its two members.
 */
admin.post("/v1/admin/loans/:id/close", async (c) => {
	const who = c.get("moderator");
	const parsed = CloseLoan.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid outcome"));
	const id = c.req.param("id");
	const loan = await c.env.DB.prepare(
		`SELECT l.copy_id, l.status, l.quantity, EXISTS (SELECT 1 FROM memberships sm
		              WHERE sm.community_id = l.community_id AND sm.status = 'suspended'
		                AND sm.member_id IN (l.borrower_id, l.lender_id, l.relay_from)) AS suspended
		   FROM loans l
		  WHERE l.id = ? AND l.community_id = ?
		    AND l.status IN ('requested', 'accepted', 'active')`,
	)
		.bind(id, who.communityId)
		.first<{
			copy_id: string;
			status: string;
			quantity: number;
			suspended: number;
		}>();
	if (!loan) return json(c, problem(404, "No open loan"));
	if (!loan.suspended)
		return json(
			c,
			problem(409, "Not suspended", "Only a loan with a suspended member"),
		);
	const { outcome } = parsed.data;
	const handedOver = loan.status === "active";
	if ((outcome === "cancelled") === handedOver)
		return json(
			c,
			problem(
				409,
				"Wrong outcome",
				handedOver
					? "The book was handed over: it came back, or it is lost"
					: "Not handed over yet: call it off",
			),
		);

	const at = now();
	// This closing, told apart from a second one sent in the same second.
	const mark = ulid();
	const closedHere = `EXISTS (SELECT 1 FROM loans WHERE id = ?2 AND lost_mark = ?3)`;
	const copy = {
		cancelled: c.env.DB.prepare(
			`UPDATE copies SET state = 'shelved' WHERE id = ?1 AND state = 'reserved' AND ${closedHere}`,
		).bind(loan.copy_id, id, mark),
		// A set stays on its owner's shelf while parts of it are out.
		returned: c.env.DB.prepare(
			`UPDATE copies SET state = ${BACK_WITH_OWNER}, holder_id = owner_id WHERE id = ?1 AND quantity = 1 AND ${closedHere}`,
		).bind(loan.copy_id, id, mark),
		lost: markLost(c.env, loan.copy_id, loan.quantity, id, mark),
	}[outcome];
	const relays =
		outcome === "lost" ? await waitingRelays(c.env, loan.copy_id) : [];
	const [closed, , ended] = await c.env.DB.batch([
		c.env.DB.prepare(
			"UPDATE loans SET status = ?, outcome = ?, closed_at = ?, lost_mark = ? WHERE id = ? AND status = ?",
		).bind(
			outcome === "returned" ? "completed" : outcome,
			outcome,
			at,
			mark,
			id,
			loan.status,
		),
		copy,
		// Nobody can be handed on what is lost: a relay waiting on it ends.
		...(outcome === "lost"
			? [endWaitingRelays(c.env, loan.copy_id, id, mark, at)]
			: []),
		// A pending relay on a returned copy is now an ordinary request.
		...(outcome === "returned"
			? [
					c.env.DB.prepare(
						`UPDATE loans SET relay_from = NULL WHERE copy_id = ?1 AND status IN ('requested', 'accepted') AND ${closedHere}`,
					).bind(loan.copy_id, id, mark),
				]
			: []),
		dropStaleHandoffs(c.env, loan.copy_id),
	]);
	if (!closed?.meta.changes)
		return json(
			c,
			problem(409, "The loan has moved on", "Someone changed it just now"),
		);
	if (outcome === "lost" && ended?.meta.changes)
		relaysEnded(c.env, c.executionCtx, relays, at);
	c.executionCtx.waitUntil(
		c.env.CONVO.closed(id, at).catch((error: unknown) =>
			console.error("[convo] close failed", id, error),
		),
	);
	if (outcome !== "lost")
		c.executionCtx.waitUntil(
			onCopyAvailable(c.env, loan.copy_id).catch((error: unknown) =>
				console.error("[waitlist] offer failed", loan.copy_id, error),
			),
		);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "loan.closed", { loanId: id }),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.state_changed", {
			copyId: loan.copy_id,
		}),
	);
	return c.body(null, 204);
});

admin.get("/v1/admin/attention", async (c) => {
	const who = c.get("moderator");
	return c.json({ items: await attention(c.env, who.communityId, who.id) });
});

/** A snapshot now, rather than waiting for tonight. */
admin.post("/v1/admin/backup", async (c) => {
	const result = await backup(c.env);
	return result
		? c.json(result, 201)
		: json(c, problem(503, "No backup bucket", "Not configured here"));
});

admin.get("/v1/admin/members", async (c) => {
	const who = c.get("moderator");
	const { results } = await c.env.DB.prepare(
		`SELECT m.id, m.email, m.display_name, m.area_label, ms.role, ms.status, ms.joined_at,
		        (SELECT count(*) FROM copies WHERE owner_id = m.id AND state != 'retired') AS copies,
		        (SELECT max(last_seen_at) FROM sessions WHERE member_id = m.id) AS last_seen_at
		   FROM memberships ms JOIN members m ON m.id = ms.member_id
		  WHERE ms.community_id = ?
		  ORDER BY ms.role DESC, m.display_name COLLATE NOCASE`,
	)
		.bind(who.communityId)
		.all<MemberRow>();
	// Addresses are the admin's: a moderator looks after people by name.
	const seesEmail = who.role === "admin";

	return c.json({
		members: results.map((row) => ({
			id: row.id,
			email: seesEmail ? row.email : null,
			displayName: row.display_name,
			areaLabel: row.area_label,
			role: row.role,
			status: row.status,
			copies: row.copies,
			joinedAt: row.joined_at,
			lastSeenAt: row.last_seen_at,
		})),
	});
});

/** The library's settings: the admin's to read and change. */
admin.get("/v1/admin/settings", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const row = await c.env.DB.prepare(
		"SELECT name, loan_days, member_invites_open, member_invite_days, default_locale, languages, compact, texts, centre_lat, centre_lng, centre_label, radius_m, accent FROM communities WHERE id = ?",
	)
		.bind(who.communityId)
		.first<{
			name: string;
			loan_days: number;
			member_invites_open: number;
			member_invite_days: number;
			default_locale: "en" | "he";
			languages: string;
			compact: number;
			texts: string;
			centre_lat: number;
			centre_lng: number;
			centre_label: string | null;
			radius_m: number;
			accent: string | null;
		}>();
	if (!row) return json(c, problem(404, "No such library"));
	const settings: LibrarySettings & {
		centre: { label: string; lat: number; lng: number };
	} = {
		name: row.name,
		loanDays: row.loan_days,
		memberInvitesOpen: row.member_invites_open,
		memberInviteDays: row.member_invite_days,
		defaultLocale: row.default_locale,
		languages: row.languages.split(",") as ("en" | "he")[],
		compact: row.compact === 1,
		texts: readTexts(row.texts),
		centre: {
			label: row.centre_label ?? "",
			lat: row.centre_lat,
			lng: row.centre_lng,
		},
		radiusM: row.radius_m,
		accent: row.accent,
	};
	return c.json(settings);
});

admin.patch("/v1/admin/settings", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const parsed = LibrarySettings.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Invalid settings"));
	const {
		name,
		loanDays,
		memberInvitesOpen,
		memberInviteDays,
		defaultLocale,
		languages,
		compact,
		texts,
		centre,
		radiusM,
		accent,
	} = parsed.data;
	// The default has to be one the library offers, whichever of the two changed.
	const current = await c.env.DB.prepare(
		"SELECT default_locale, languages, texts, centre_lat, centre_lng FROM communities WHERE id = ?",
	)
		.bind(who.communityId)
		.first<{
			default_locale: "en" | "he";
			languages: string;
			texts: string;
			centre_lat: number;
			centre_lng: number;
		}>();
	if (!current) return json(c, problem(404, "No such library"));
	// Stored in one fixed order, as the column's check expects.
	const offered = languages
		? (["en", "he"] as const).filter((l) => languages.includes(l)).join(",")
		: current.languages;
	// A new centre: the point given, or the typed name placed near the old one.
	const point = centre
		? centre.lat !== undefined && centre.lng !== undefined
			? { lat: centre.lat, lng: centre.lng }
			: await resolvePlace(
					c.env,
					c.executionCtx,
					{ lat: current.centre_lat, lng: current.centre_lng },
					centre.label,
				)
		: null;
	if (centre && !point)
		return json(c, problem(422, "Where is that?", "Try a postcode"));
	if (!offered.split(",").includes(defaultLocale ?? current.default_locale))
		return json(
			c,
			problem(422, "The default language must be one the library offers"),
		);
	await c.env.DB.prepare(
		`UPDATE communities SET name = ?, loan_days = ?, member_invites_open = ?, member_invite_days = ?, default_locale = COALESCE(?, default_locale),
		       languages = ?, compact = COALESCE(?, compact), texts = COALESCE(?, texts),
		       centre_lat = COALESCE(?, centre_lat), centre_lng = COALESCE(?, centre_lng),
		       centre_label = COALESCE(?, centre_label), radius_m = COALESCE(?, radius_m),
		       accent = CASE WHEN ? THEN ? ELSE accent END
		  WHERE id = ?`,
	)
		.bind(
			name,
			loanDays,
			memberInvitesOpen,
			memberInviteDays,
			defaultLocale ?? null,
			offered,
			compact === undefined ? null : compact ? 1 : 0,
			// Per language: words for a language left out of the change stay, so
			// offering one language for a while does not lose the other's.
			texts === undefined
				? null
				: JSON.stringify({ ...readTexts(current.texts), ...texts }),
			point?.lat ?? null,
			point?.lng ?? null,
			centre?.label || null,
			radiusM ?? null,
			// Left out, it stays; null, or the house green itself, goes back to the house.
			accent === undefined ? 0 : 1,
			accent === undefined || accent === HOUSE_ACCENT ? null : accent,
			who.communityId,
		)
		.run();
	return c.body(null, 204);
});

const LOG_PAGE = 30;

/** The moderation log, newest first: the library's admin's to read. */
admin.get("/v1/admin/log", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
	const [count, rows] = await Promise.all([
		c.env.DB.prepare(
			"SELECT count(*) AS n FROM moderation_log WHERE community_id = ?",
		)
			.bind(who.communityId)
			.first<{ n: number }>(),
		c.env.DB.prepare(
			`SELECT l.id, l.action, l.target, l.details, l.created_at, l.via,
			        a.id AS actor_id, a.display_name AS actor_name,
			        t.display_name AS target_name
			   FROM moderation_log l
			   JOIN members a ON a.id = l.actor_id
			   LEFT JOIN members t ON t.id = l.target
			  WHERE l.community_id = ?
			  ORDER BY l.created_at DESC, l.id DESC
			  LIMIT ? OFFSET ?`,
		)
			.bind(who.communityId, LOG_PAGE, (page - 1) * LOG_PAGE)
			.all<{
				id: string;
				action: string;
				target: string | null;
				details: string | null;
				created_at: number;
				via: string | null;
				actor_id: string;
				actor_name: string;
				target_name: string | null;
			}>(),
	]);
	const total = count?.n ?? 0;
	const log: LogPage = {
		page,
		pages: Math.max(1, Math.ceil(total / LOG_PAGE)),
		total,
		entries: rows.results.map((row) => ({
			id: row.id,
			actor: { id: row.actor_id, displayName: row.actor_name },
			action: row.action,
			target: row.target,
			targetName: row.target_name,
			details: row.details,
			via: row.via,
			createdAt: row.created_at,
		})),
	};
	return c.json(log);
});

/** One member of this community, with how they came in and what they did. */
admin.get("/v1/admin/members/:id", async (c) => {
	const who = c.get("moderator");
	const id = c.req.param("id");
	const row = await c.env.DB.prepare(
		`SELECT m.id, m.email, m.display_name, m.area_label, m.invited_by, m.invited_via,
		        ms.role, ms.status, ms.joined_at,
		        (SELECT count(*) FROM copies WHERE owner_id = m.id AND state != 'retired') AS copies,
		        (SELECT max(last_seen_at) FROM sessions WHERE member_id = m.id) AS last_seen_at,
		        -- Whether they are set up to hand a book over; never the place itself.
		        (trim(coalesce(m.meeting_place, '')) != '') AS has_place,
		        EXISTS (SELECT 1 FROM availability a WHERE a.member_id = m.id) AS has_times,
		        ib.display_name AS invited_by_name
		   FROM memberships ms JOIN members m ON m.id = ms.member_id
		   LEFT JOIN members ib ON ib.id = m.invited_by
		  WHERE ms.community_id = ? AND m.id = ?`,
	)
		.bind(who.communityId, id)
		.first<
			MemberRow & {
				invited_by: string | null;
				invited_via: string | null;
				invited_by_name: string | null;
			}
		>();
	if (!row) return json(c, problem(404, "Not a member"));

	const [invite, invited, filed, about, loans] = await Promise.all([
		row.invited_via
			? c.env.DB.prepare(
					`SELECT i.id, i.created_at, i.uses, i.max_uses, i.created_by, m.display_name
					   FROM invites i JOIN members m ON m.id = i.created_by
					  WHERE i.id = ? AND i.community_id = ?`,
				)
					.bind(row.invited_via, who.communityId)
					.first<{
						id: string;
						created_at: number;
						uses: number;
						max_uses: number;
						created_by: string;
						display_name: string;
					}>()
			: null,
		c.env.DB.prepare(
			`SELECT m.id, m.display_name, ms.joined_at, ms.status
			   FROM members m JOIN memberships ms ON ms.member_id = m.id AND ms.community_id = ?
			  WHERE m.invited_by = ? ORDER BY ms.joined_at`,
		)
			.bind(who.communityId, id)
			.all<{
				id: string;
				display_name: string;
				joined_at: number;
				status: AdminMemberDetail["member"]["status"];
			}>(),
		memberReports(c.env, who.communityId, "reporter_id", "subject_member", id),
		memberReports(c.env, who.communityId, "subject_member", "reporter_id", id),
		c.env.DB.prepare(
			`SELECT
			   (SELECT count(*) FROM loans WHERE borrower_id = ?1 AND community_id = ?2) AS borrowed,
			   (SELECT count(*) FROM loans WHERE lender_id = ?1 AND community_id = ?2) AS lent,
			   (SELECT count(*) FROM loans WHERE (borrower_id = ?1 OR lender_id = ?1)
			      AND community_id = ?2 AND status IN ('requested', 'accepted', 'active')) AS open`,
		)
			.bind(id, who.communityId)
			.first<{ borrowed: number; lent: number; open: number }>(),
	]);

	const detail: AdminMemberDetail = {
		member: {
			id: row.id,
			email: who.role === "admin" ? row.email : null,
			displayName: row.display_name,
			areaLabel: row.area_label,
			role: row.role,
			status: row.status,
			copies: row.copies,
			joinedAt: row.joined_at,
			lastSeenAt: row.last_seen_at,
			hasMeetingPlace: row.has_place === 1,
			hasAvailability: row.has_times === 1,
		},
		invitedBy: row.invited_by
			? { id: row.invited_by, displayName: row.invited_by_name ?? "" }
			: null,
		invite: invite
			? {
					id: invite.id,
					createdBy: {
						id: invite.created_by,
						displayName: invite.display_name,
					},
					createdAt: invite.created_at,
					uses: invite.uses,
					maxUses: invite.max_uses,
				}
			: null,
		// Tracing how someone came in, all the way back, is the admin's.
		trail: who.role === "admin" ? await trail(c.env, id) : null,
		openInvites:
			who.role === "admin"
				? await openInvites(c.env, id, who.communityId)
				: null,
		invited: invited.results.map((entry) => ({
			id: entry.id,
			displayName: entry.display_name,
			joinedAt: entry.joined_at,
			status: entry.status,
		})),
		reportsFiled: filed,
		reportsAbout: about,
		loans: loans ?? { borrowed: 0, lent: 0, open: 0 },
	};
	return c.json(detail);
});

/**
 * Every open invite link a member made, revoked at once: the admin's lever
 * when somebody turns out to be bringing in people who should not be here.
 */
admin.post("/v1/admin/members/:id/invites/revoke", async (c) => {
	const who = await libraryAdmin(c);
	if (!who) return json(c, problem(403, "Admins only"));
	const result = await c.env.DB.prepare(
		`UPDATE invites SET revoked_at = ?
		  WHERE created_by = ? AND community_id = ? AND revoked_at IS NULL
		    AND expires_at > ? AND uses < max_uses`,
	)
		.bind(now(), c.req.param("id"), who.communityId, now())
		.run();
	return c.json({ revoked: result.meta.changes ?? 0 });
});

admin.post("/v1/admin/members/:id/role", async (c) => {
	const who = c.get("moderator");
	const parsed = SetRole.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid role"));
	const target = c.req.param("id");
	const role = parsed.data.role;

	const theirs = await roleOf(c.env, target, who.communityId);
	if (!theirs) return json(c, problem(404, "Not a member"));
	// Roles are the admin's to give and take. A moderator may only step down.
	const steppingDown =
		target === who.id && theirs === "moderator" && role === "member";
	if (who.role !== "admin" && !steppingDown)
		return json(c, problem(403, "Admins only", "Only the admin changes roles"));

	// Never leave a community without an admin, or without anybody to moderate.
	if (theirs === "admin" && role !== "admin") {
		const admins = await count(c.env, who.communityId, ["admin"], target);
		if (!admins)
			return json(
				c,
				problem(409, "Last admin", "Make someone else admin first"),
			);
	}
	if (role === "member" && theirs !== "member") {
		const others = await count(
			c.env,
			who.communityId,
			["moderator", "admin"],
			target,
		);
		if (!others)
			return json(
				c,
				problem(409, "Last moderator", "Promote someone else first"),
			);
	}

	const result = await c.env.DB.prepare(
		"UPDATE memberships SET role = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(parsed.data.role, target, who.communityId)
		.run();
	if (!result.meta.changes) return json(c, problem(404, "Not a member"));
	return c.body(null, 204);
});

admin.post("/v1/admin/members/:id/status", async (c) => {
	const who = c.get("moderator");
	const parsed = SetStatus.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid status"));
	const target = c.req.param("id");
	if (target === who.id)
		return json(c, problem(409, "Cannot suspend yourself"));
	// A moderator looks after members; suspending a moderator or the admin is
	// the admin's call, and the last admin cannot be suspended at all.
	const theirs = await roleOf(c.env, target, who.communityId);
	if (!theirs) return json(c, problem(404, "Not a member"));
	if (theirs !== "member" && who.role !== "admin")
		return json(c, problem(403, "Admins only", "Only the admin can do that"));
	if (
		theirs === "admin" &&
		parsed.data.status === "suspended" &&
		!(await count(c.env, who.communityId, ["admin"], target))
	)
		return json(c, problem(409, "Last admin", "Make someone else admin first"));

	const result = await c.env.DB.prepare(
		"UPDATE memberships SET status = ? WHERE member_id = ? AND community_id = ?",
	)
		.bind(parsed.data.status, target, who.communityId)
		.run();
	if (!result.meta.changes) return json(c, problem(404, "Not a member"));

	// Suspension ends every session; the member finds out at the next request.
	// Copies held for them go to the next in line, and their own copies are
	// held for nobody.
	if (parsed.data.status === "suspended") {
		const held = await c.env.DB.prepare(
			"SELECT offered_copy_id FROM waitlist WHERE member_id = ? AND offered_copy_id IS NOT NULL",
		)
			.bind(target)
			.all<{ offered_copy_id: string }>();
		await c.env.DB.batch([
			c.env.DB.prepare(
				"UPDATE sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL",
			).bind(now(), target),
			// Nothing reaches their devices either.
			c.env.DB.prepare(
				"DELETE FROM push_subscriptions WHERE member_id = ?",
			).bind(target),
			c.env.DB.prepare(
				`UPDATE waitlist SET offered_copy_id = NULL, offer_expires_at = NULL
				  WHERE member_id = ?1 OR offered_copy_id IN (SELECT id FROM copies WHERE owner_id = ?1)`,
			).bind(target),
		]);
		for (const row of held.results)
			c.executionCtx.waitUntil(
				onCopyAvailable(c.env, row.offered_copy_id).catch((error: unknown) =>
					console.error("[waitlist] offer failed", row.offered_copy_id, error),
				),
			);
	}
	return c.body(null, 204);
});

/** Assets: every copy in the community, newest first, with who holds a claim on it. */
admin.get("/v1/admin/copies", async (c) => {
	const who = c.get("moderator");
	const q = (c.req.query("q") ?? "").trim();
	const { results } = await c.env.DB.prepare(
		`SELECT c.id, c.state, c.lending, c.created_at, e.title, e.cover_url, w.id AS work_id, w.authors,
		        m.id AS owner_id, m.display_name AS owner_name,
		        l.id AS loan_id, l.status AS loan_status, b.display_name AS borrower_name
		   FROM copy_shares cs
		   JOIN copies c ON c.id = cs.copy_id
		   JOIN editions e ON e.id = c.edition_id
		   JOIN works w ON w.id = e.work_id
		   JOIN members m ON m.id = c.owner_id
		   -- One row a copy: the latest open loan, of the several a set can have.
		   LEFT JOIN loans l ON l.id = (
		     SELECT o.id FROM loans o WHERE o.copy_id = c.id
		        AND o.status IN ('requested', 'accepted', 'active')
		      ORDER BY o.requested_at DESC LIMIT 1)
		   LEFT JOIN members b ON b.id = l.borrower_id
		  WHERE cs.community_id = ? AND c.state != 'retired'
		    AND (? = '' OR e.search_key LIKE ? ESCAPE '\\' OR m.display_name LIKE ? ESCAPE '\\')
		  ORDER BY c.created_at DESC LIMIT 200`,
	)
		// Searched as the catalogue is: final letters, niqqud and case set aside.
		.bind(who.communityId, q, containing(searchKey(q)), containing(q))
		.all<CopyRow>();
	return c.json({
		copies: results.map((row) => ({
			id: row.id,
			workId: row.work_id,
			title: row.title,
			authors: JSON.parse(row.authors) as string[],
			coverUrl: row.cover_url,
			state: row.state,
			lending: row.lending,
			owner: { id: row.owner_id, displayName: row.owner_name },
			openLoan: row.loan_id
				? {
						id: row.loan_id,
						status: row.loan_status ?? "",
						borrowerName: row.borrower_name ?? "",
					}
				: null,
			createdAt: row.created_at,
		})),
	});
});

/** Take a copy out of the catalogue on the owner's behalf (spam, duplicates, departed members). */
admin.post("/v1/admin/copies/:id/retire", async (c) => {
	const who = c.get("moderator");
	const id = c.req.param("id");
	const open = await c.env.DB.prepare(
		`SELECT 1 FROM loans WHERE copy_id = ? AND status IN ('requested', 'accepted', 'active')`,
	)
		.bind(id)
		.first();
	if (open) return json(c, problem(409, "Loan in progress"));
	const result = await c.env.DB.prepare(
		`UPDATE copies SET state = 'retired' WHERE id = ?
		    AND id IN (SELECT copy_id FROM copy_shares WHERE community_id = ?)`,
	)
		.bind(id, who.communityId)
		.run();
	if (!result.meta.changes) return json(c, problem(404, "No such copy"));
	await releaseHolds(c.env, id).run();
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.retired", { copyId: id }),
	);
	await forget(c.env, vocabularyKey(who.communityId));
	return c.body(null, 204);
});

admin.get("/v1/admin/invites", async (c) => {
	const who = c.get("moderator");
	const { results } = await c.env.DB.prepare(
		`SELECT i.id, m.display_name AS created_by, i.created_by AS created_by_id,
		        i.max_uses, i.uses, i.expires_at, i.created_at, i.revoked_at, i.sent_to
		   FROM invites i JOIN members m ON m.id = i.created_by
		  WHERE i.community_id = ?
		  ORDER BY i.created_at DESC LIMIT 50`,
	)
		.bind(who.communityId)
		.all<InviteRow & { created_by_id: string }>();
	// Addresses are the admin's, as on the members' list; a moderator sees
	// the ones they typed in themselves.
	const seesAll = who.role === "admin";
	return c.json({
		invites: results.map((row) => ({
			id: row.id,
			createdBy: row.created_by,
			maxUses: row.max_uses,
			uses: row.uses,
			expiresAt: row.expires_at,
			createdAt: row.created_at,
			revokedAt: row.revoked_at,
			sentTo: seesAll || row.created_by_id === who.id ? row.sent_to : null,
		})),
	});
});

/** Same as POST /v1/invites, kept here so the panel has one prefix to authorise. */
admin.post("/v1/admin/invites", async (c) => {
	const who = c.get("moderator");
	const parsed = CreateInvite.safeParse(
		(await c.req.json().catch(() => null)) ?? {},
	);
	if (!parsed.success) return json(c, problem(422, "Invalid invite"));
	const invite = await createInvite(
		c.env,
		who.communityId,
		who.id,
		parsed.data.maxUses,
		parsed.data.days,
	);
	return c.json(
		{
			id: invite.id,
			token: invite.token,
			url: `${c.env.APP_URL}/join?invite=${encodeURIComponent(invite.token)}`,
			maxUses: parsed.data.maxUses,
			expiresAt: invite.expiresAt,
		},
		201,
	);
});

/**
 * Invite one person by email: no link to pass on. The email carries a
 * sign-in link tied to a one-use invite, good for as long as the library
 * lets members' invites live, so the first tap both joins and signs in.
 */
admin.post("/v1/admin/invites/email", async (c) => {
	const who = c.get("moderator");
	const parsed = EmailInvite.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid email"));
	const { email } = parsed.data;

	const limit = await take(c.env, {
		bucket: "invite_email:moderator",
		subject: who.id,
		allow: 30,
		per: 86_400,
	});
	if (!limit.ok)
		return json(
			c,
			problem(429, "Too many invitations", "Thirty a day is the limit"),
		);

	const existing = await c.env.DB.prepare(
		"SELECT 1 FROM members WHERE email = ?",
	)
		.bind(email)
		.first();
	if (existing) return json(c, problem(409, "Already a member"));

	const about = await c.env.DB.prepare(
		`SELECT co.name, co.default_locale, co.member_invite_days, co.type, m.display_name
		   FROM communities co, members m WHERE co.id = ? AND m.id = ?`,
	)
		.bind(who.communityId, who.id)
		.first<{
			name: string;
			default_locale: "en" | "he" | null;
			member_invite_days: number | null;
			type: LibraryType;
			display_name: string;
		}>();
	if (!about) return json(c, problem(404, "No such community"));
	const days = about.member_invite_days ?? 14;

	const invite = await createInvite(
		c.env,
		who.communityId,
		who.id,
		1,
		days,
		email,
	);
	const { token } = await createMagicLink(
		c.env,
		email,
		invite.id,
		days * 24 * 60,
	);
	const delivery = await c.env.NOTIFY.send({
		kind: "invitation",
		libraryType: about.type,
		to: email,
		locale: about.default_locale ?? "en",
		url: `${c.env.APP_URL}/auth/callback?token=${encodeURIComponent(token)}`,
		inviterName: about.display_name,
		communityName: about.name,
		expiresInDays: days,
	});
	// The link exists only in that email: one that did not go is no
	// invitation, and the moderator has to hear so, to try again.
	if (!delivery.delivered && delivery.channel === "email") {
		await c.env.DB.prepare("UPDATE invites SET revoked_at = ? WHERE id = ?")
			.bind(now(), invite.id)
			.run();
		return json(c, problem(502, "Not sent", "The email did not go; try again"));
	}
	return c.json({ id: invite.id, expiresAt: invite.expiresAt }, 201);
});

admin.post("/v1/admin/invites/:id/revoke", async (c) => {
	const who = c.get("moderator");
	const result = await c.env.DB.prepare(
		"UPDATE invites SET revoked_at = ? WHERE id = ? AND community_id = ? AND revoked_at IS NULL",
	)
		.bind(now(), c.req.param("id"), who.communityId)
		.run();
	if (!result.meta.changes) return json(c, problem(404, "No such invite"));
	return c.body(null, 204);
});

interface MemberRow {
	id: string;
	email: string;
	display_name: string;
	area_label: string | null;
	role: "member" | "moderator" | "admin";
	status: "pending" | "active" | "suspended" | "left";
	joined_at: number;
	copies: number;
	last_seen_at: number | null;
	has_place?: number;
	has_times?: number;
}

interface CopyRow {
	id: string;
	work_id: string;
	state: string;
	lending: string;
	created_at: number;
	title: string;
	cover_url: string | null;
	authors: string;
	owner_id: string;
	owner_name: string;
	loan_id: string | null;
	loan_status: string | null;
	borrower_name: string | null;
}

interface InviteRow {
	id: string;
	created_by: string;
	max_uses: number;
	uses: number;
	expires_at: number;
	created_at: number;
	revoked_at: number | null;
	sent_to: string | null;
}

async function roleOf(
	env: Env,
	memberId: string,
	communityId: string,
): Promise<"member" | "moderator" | "admin" | null> {
	const row = await env.DB.prepare(
		"SELECT role FROM memberships WHERE member_id = ? AND community_id = ?",
	)
		.bind(memberId, communityId)
		.first<{ role: "member" | "moderator" | "admin" }>();
	return row?.role ?? null;
}

/** Active members of the community in these roles, not counting one of them. */
async function count(
	env: Env,
	communityId: string,
	roles: ("moderator" | "admin")[],
	except: string,
): Promise<number> {
	const row = await env.DB.prepare(
		`SELECT count(*) AS n FROM memberships
		  WHERE community_id = ? AND status = 'active' AND member_id != ?
		    AND role IN (${roles.map(() => "?").join(", ")})`,
	)
		.bind(communityId, except, ...roles)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

/** Reports this member filed, or that are about them, newest first. */
async function memberReports(
	env: Env,
	communityId: string,
	self: "reporter_id" | "subject_member",
	other: "reporter_id" | "subject_member",
	memberId: string,
): Promise<MemberReport[]> {
	const { results } = await env.DB.prepare(
		`SELECT r.id, r.kind, r.status, r.created_at, o.id AS other_id, o.display_name AS other_name
		   FROM reports r LEFT JOIN members o ON o.id = r.${other}
		  WHERE r.community_id = ? AND r.${self} = ?
		  ORDER BY r.created_at DESC`,
	)
		.bind(communityId, memberId)
		.all<{
			id: string;
			kind: string;
			status: MemberReport["status"];
			created_at: number;
			other_id: string | null;
			other_name: string | null;
		}>();
	return results.map((row) => ({
		id: row.id,
		kind: row.kind,
		status: row.status,
		createdAt: row.created_at,
		other: row.other_id
			? { id: row.other_id, displayName: row.other_name ?? "" }
			: null,
	}));
}

/**
 * Who invited whom, from this member back to the first of the chain: each
 * step is the member who vouched for the one before. Stops at a loop or at
 * fifty steps, whichever comes first.
 */
async function trail(
	env: Env,
	memberId: string,
): Promise<NonNullable<AdminMemberDetail["trail"]>> {
	const steps: NonNullable<AdminMemberDetail["trail"]> = [];
	const seen = new Set<string>();
	let next: string | null = memberId;
	while (next && !seen.has(next) && steps.length < 50) {
		seen.add(next);
		const row: {
			id: string;
			display_name: string;
			invited_by: string | null;
			joined_at: number | null;
		} | null = await env.DB.prepare(
			`SELECT m.id, m.display_name, m.invited_by,
			        (SELECT min(joined_at) FROM memberships WHERE member_id = m.id) AS joined_at
			   FROM members m WHERE m.id = ?`,
		)
			.bind(next)
			.first();
		if (!row) break;
		steps.push({
			id: row.id,
			displayName: row.display_name,
			joinedAt: row.joined_at,
		});
		next = row.invited_by;
	}
	return steps;
}

/** The invite links a member made that could still let somebody in. */
async function openInvites(
	env: Env,
	memberId: string,
	communityId: string,
): Promise<NonNullable<AdminMemberDetail["openInvites"]>> {
	const { results } = await env.DB.prepare(
		`SELECT id, created_at, expires_at, uses, max_uses FROM invites
		  WHERE created_by = ? AND community_id = ? AND revoked_at IS NULL
		    AND expires_at > ? AND uses < max_uses
		  ORDER BY created_at DESC`,
	)
		.bind(memberId, communityId, now())
		.all<{
			id: string;
			created_at: number;
			expires_at: number;
			uses: number;
			max_uses: number;
		}>();
	return results.map((row) => ({
		id: row.id,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		uses: row.uses,
		maxUses: row.max_uses,
	}));
}
