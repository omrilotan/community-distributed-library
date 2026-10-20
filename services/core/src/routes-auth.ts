import { Hono } from "hono";
import {
	CreateInvite,
	ExchangeRequest,
	MagicLinkRequest,
	UpdateMe,
	problem,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { moderator, viewer, viewerWith } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { offerWaitedFor } from "./waitlist.ts";
import {
	consumeInvite,
	createInvite,
	findInvite,
	inviteState,
} from "./invites.ts";
import {
	MAGIC_LINK_MINUTES,
	consumeMagicLink,
	createMagicLink,
	createSession,
	revokeSession,
} from "./sessions.ts";
import { snapArea } from "./geo.ts";
import { denied, json, tooMany } from "./problem.ts";
import { callerIp, take } from "./rate-limit.ts";
import { areaName, resolvePlace } from "./places.ts";
import { theLibrary } from "./library.ts";
import { communityCentre } from "./routes-places.ts";
import { unreadByLoan } from "./unread.ts";

export const auth = new Hono<{ Bindings: Env }>();

/**
 * Step 1 of sign-in. Known address → link. Unknown address with a valid
 * invite → link that will create the member. Anything else → the same 200,
 * so the endpoint cannot be used to test whether an address is a member.
 */
auth.post("/v1/auth/magic-link", async (c) => {
	const parsed = MagicLinkRequest.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	const { email, invite, locale } = parsed.data;

	// This endpoint sends email to an address the caller only has to name, so
	// it is limited hard and the limit is told to whoever hit it. The short
	// window is the address from one place, so somebody elsewhere asking for
	// it cannot use up its owner's; the day's cap is the address anywhere,
	// so nobody can send a member more than a handful a day.
	const ip = callerIp(c.req.raw);
	const perEmail = await take(c.env, {
		bucket: "magic_link:email",
		subject: `${email} ${ip}`,
		allow: 3,
		per: 15 * 60,
	});
	if (!perEmail.ok) {
		return tooMany(
			c,
			"Too many sign-in links",
			"Three links in fifteen minutes is the limit. Check your inbox, including spam.",
			perEmail.retryAfter,
		);
	}
	const perDay = await take(c.env, {
		bucket: "magic_link:email:day",
		subject: email,
		allow: 20,
		per: 24 * 60 * 60,
	});
	if (!perDay.ok) {
		return tooMany(
			c,
			"Too many sign-in links",
			"That address has had enough links for today. Check your inbox, including spam, or sign in from another device you use.",
			perDay.retryAfter,
		);
	}
	const perCaller = await take(c.env, {
		bucket: "magic_link:ip",
		subject: ip,
		allow: 10,
		per: 60 * 60,
	});
	if (!perCaller.ok) {
		return tooMany(
			c,
			"Too many sign-in links",
			"Too many sign-in attempts from here. Try again later.",
			perCaller.retryAfter,
		);
	}

	const member = await c.env.DB.prepare(
		"SELECT id FROM members WHERE email = ?",
	)
		.bind(email)
		.first<{ id: string }>();
	const usableInvite = invite ? await findInvite(c.env, invite) : null;
	if (!member && !usableInvite) {
		// Production says nothing. Development says why, so a developer is not left
		// waiting for an email that will never come.
		return c.json(
			c.env.DEV_AUTH === "true"
				? { ok: true, debugReason: "unknown_email" }
				: { ok: true },
		);
	}

	const issue = async () => {
		const token = await createMagicLink(
			c.env,
			email,
			member ? null : (usableInvite?.id ?? null),
		);
		const url = `${c.env.APP_URL}/auth/callback?token=${encodeURIComponent(token)}`;
		// Development always logs the link, whether or not notify also emails it.
		if (c.env.DEV_AUTH === "true")
			console.log(`[auth] magic link for ${email}: ${url}`);
		const delivery = await c.env.NOTIFY.send({
			kind: "magic_link",
			to: email,
			locale,
			url,
			expiresInMinutes: MAGIC_LINK_MINUTES,
		});
		return { url, delivery };
	};

	// Only development gets the link back; production has to read its email.
	if (c.env.DEV_AUTH === "true") {
		const { url, delivery } = await issue();
		return c.json({ ok: true, debugUrl: url, delivery });
	}
	// Answered before the link is even made, so a member's address takes no
	// longer to answer than a stranger's.
	c.executionCtx.waitUntil(
		issue().then(
			() => undefined,
			(error: unknown) => console.error("[auth] magic link not sent", error),
		),
	);
	return c.json({ ok: true });
});

/** How long a link shown on screen, for the member's own other device, lasts. */
export const DEVICE_LINK_MINUTES = 10;

/**
 * Sign in on another device: the member, signed in here, gets a one-time
 * link to open (or scan) there. It is the emailed link without the email,
 * shorter-lived. Only from the site itself — an assistant's token must never
 * be able to mint a way in.
 */
auth.post("/v1/me/device-link", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.session) return json(c, problem(403, "Sessions only"));

	const limit = await take(c.env, {
		bucket: "device_link:member",
		subject: member.id,
		allow: 5,
		per: 60 * 60,
	});
	if (!limit.ok) {
		return tooMany(
			c,
			"Too many links",
			"Five in an hour is the limit. The last one still works for a few minutes.",
			limit.retryAfter,
		);
	}

	const row = await c.env.DB.prepare("SELECT email FROM members WHERE id = ?")
		.bind(member.id)
		.first<{ email: string }>();
	if (!row) return json(c, problem(404, "Not a member"));
	const token = await createMagicLink(
		c.env,
		row.email,
		null,
		DEVICE_LINK_MINUTES,
	);
	return c.json(
		{
			url: `${c.env.APP_URL}/auth/callback?token=${encodeURIComponent(token)}`,
			expiresAt: now() + DEVICE_LINK_MINUTES * 60,
		},
		201,
	);
});

/** Step 2. Trades a one-shot link for a session; creates the member on an invite. */
auth.post("/v1/auth/exchange", async (c) => {
	// A one-shot token is 32 random characters; this is belt and braces.
	const guesses = await take(c.env, {
		bucket: "exchange:ip",
		subject: callerIp(c.req.raw),
		allow: 20,
		per: 15 * 60,
	});
	if (!guesses.ok) {
		return tooMany(
			c,
			"Too many attempts",
			"Too many sign-in attempts from here. Try again later.",
			guesses.retryAfter,
		);
	}
	const parsed = ExchangeRequest.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Invalid request"));

	const link = await consumeMagicLink(c.env, parsed.data.token);
	if (!link)
		return json(c, problem(410, "Link expired", "Ask for a new sign-in link"));

	let member = await c.env.DB.prepare("SELECT id FROM members WHERE email = ?")
		.bind(link.email)
		.first<{ id: string }>();
	let isNew = false;

	if (!member) {
		if (!link.invite_id) return json(c, problem(410, "Link expired"));
		const invite = await consumeInvite(c.env, link.invite_id);
		if (!invite)
			return json(c, problem(410, "Invite used up", "Ask for a new invite"));

		const id = ulid();
		await c.env.DB.batch([
			c.env.DB.prepare(
				`INSERT INTO members (id, email, display_name, locale, created_at, invited_by, invited_via)
				 VALUES (?, ?, ?, 'en', ?, ?, ?)`,
			).bind(
				id,
				link.email,
				link.email.split("@")[0] ?? "",
				now(),
				invite.created_by,
				link.invite_id,
			),
			c.env.DB.prepare(
				"INSERT INTO memberships (member_id, community_id, role, status, joined_at) VALUES (?, ?, 'member', 'active', ?)",
			).bind(id, invite.community_id, now()),
		]);
		member = { id };
		isNew = true;
	}

	const session = await createSession(c.env, member.id);
	return c.json({
		token: session.token,
		memberId: member.id,
		expiresAt: session.expiresAt,
		isNew,
	});
});

auth.post("/v1/auth/logout", async (c) => {
	const bearer = c.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (bearer) await revokeSession(c.env, bearer);
	return c.body(null, 204);
});

auth.get("/v1/me", async (c) => {
	const { member, forbidden } = await viewerWith(c, "profile:read");
	if (!member) return denied(c, forbidden);

	const [row, unread] = await Promise.all([
		c.env.DB.prepare(
			`SELECT m.email, m.display_name, m.locale, m.area_label, m.area_lat, m.area_lng, m.browse_prefs,
		        m.lend_limit, m.away_until, ms.role,
		        co.name AS community_name, co.centre_lat, co.centre_lng, co.radius_m, co.compact,
		        (SELECT count(*) FROM loans l WHERE l.lender_id = m.id AND l.status = 'requested')
		        + (SELECT count(*) FROM handoffs h JOIN loans l2 ON l2.id = h.loan_id
		            WHERE h.status = 'proposed' AND h.proposed_by != m.id
		              AND (l2.borrower_id = m.id OR l2.lender_id = m.id OR l2.relay_from = m.id))
		        -- Accepted a day ago and nobody has put forward a time yet: both
		        -- people who meet are asked, until one of them does.
		        + (SELECT count(*) FROM loans l3
		            WHERE l3.status = 'accepted' AND l3.decided_at < unixepoch() - 86400
		              AND (l3.borrower_id = m.id OR coalesce(l3.relay_from, l3.lender_id) = m.id)
		              AND NOT EXISTS (SELECT 1 FROM handoffs h3 WHERE h3.loan_id = l3.id
		                                AND h3.status IN ('proposed', 'agreed')))
		        AS attention,
		        -- Moderation's own count, kept off the Loans badge: suggestions
		        -- waiting, reports still open and loans a suspension left hanging.
		        (CASE WHEN ms.role IN ('moderator', 'admin') THEN
		            (SELECT count(*) FROM tag_proposals tp
		              WHERE tp.community_id = ms.community_id AND tp.status = 'pending')
		            + (SELECT count(*) FROM reports r
		              WHERE r.community_id = ms.community_id AND r.status = 'open')
		            -- Open loans with a suspended member: the moderators' to settle.
		            + (SELECT count(*) FROM loans l
		              WHERE l.community_id = ms.community_id
		                AND l.status IN ('requested', 'accepted', 'active')
		                AND EXISTS (SELECT 1 FROM memberships sm
		                  WHERE sm.community_id = l.community_id AND sm.status = 'suspended'
		                    AND sm.member_id IN (l.borrower_id, l.lender_id, l.relay_from)))
		          ELSE 0 END)
		        AS moderation
		   FROM members m
		   JOIN memberships ms ON ms.member_id = m.id AND ms.community_id = ?
		   JOIN communities co ON co.id = ms.community_id
		  WHERE m.id = ?`,
		)
			.bind(member.communityId, member.id)
			.first<{
				email: string;
				display_name: string;
				locale: string;
				area_label: string | null;
				area_lat: number | null;
				area_lng: number | null;
				role: "member" | "moderator" | "admin";
				lend_limit: number | null;
				away_until: number | null;
				browse_prefs: string | null;
				attention: number;
				moderation: number;
				community_name: string;
				centre_lat: number;
				centre_lng: number;
				radius_m: number;
				compact: number;
			}>(),
		unreadByLoan(c.env, member.id),
	]);
	if (!row) return json(c, problem(401, "Not signed in"));

	return c.json({
		id: member.id,
		email: row.email,
		displayName: row.display_name,
		locale: row.locale,
		area:
			row.area_lat !== null && row.area_lng !== null
				? { label: row.area_label ?? "", lat: row.area_lat, lng: row.area_lng }
				: null,
		communityId: member.communityId,
		community: {
			name: row.community_name,
			centre: { lat: row.centre_lat, lng: row.centre_lng },
			radiusM: row.radius_m,
			compact: row.compact === 1,
		},
		role: row.role,
		lendLimit: row.lend_limit,
		// Yesterday's holiday is over; only a date still ahead counts.
		awayUntil: row.away_until && row.away_until > now() ? row.away_until : null,
		moderation: row.moderation,
		browsePrefs: row.browse_prefs,
		// Unread messages and replies are something to look at too.
		attention:
			row.attention + Object.values(unread).reduce((sum, n) => sum + n, 0),
	});
});

auth.patch("/v1/me", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));

	const parsed = UpdateMe.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid profile"));
	const { displayName, locale, area, lendLimit, awayUntil, browsePrefs } =
		parsed.data;
	// An assistant may set the lending limit and the time away; a name, a
	// language, an area and how the shelves look are the member's, on the site.
	if (!member.session) {
		if (
			displayName !== undefined ||
			locale !== undefined ||
			area !== undefined ||
			browsePrefs !== undefined
		)
			return json(c, problem(403, "Sessions only"));
		if (!member.scopes.includes("shelf:write")) return denied(c, true);
	}

	// A name without a point: place it near the library, or at its centre.
	const point =
		area && (area.lat === undefined || area.lng === undefined)
			? await (async () => {
					const centre = await communityCentre(c.env, member.communityId);
					if (!centre) return null;
					return (
						(await resolvePlace(c.env, c.executionCtx, centre, area.label)) ??
						centre
					);
				})()
			: area && area.lat !== undefined && area.lng !== undefined
				? { lat: area.lat, lng: area.lng }
				: null;
	if (area && !point) return json(c, problem(422, "Where is that?"));
	const snapped = point ? snapArea(point) : null;
	// A language the library offers: in one that offers only Hebrew, an
	// English choice would send emails nobody reads in it.
	const library = locale ? await theLibrary(c.env) : null;
	const language =
		locale && library
			? library.languages.includes(locale)
				? locale
				: library.defaultLocale
			: undefined;
	await c.env.DB.prepare(
		`UPDATE members SET
		   display_name = COALESCE(?, display_name),
		   locale = COALESCE(?, locale),
		   area_label = COALESCE(?, area_label),
		   area_lat = COALESCE(?, area_lat),
		   area_lng = COALESCE(?, area_lng),
		   -- Explicit null lifts the limit, so this one is not COALESCEd away.
		   lend_limit = CASE WHEN ? THEN ? ELSE lend_limit END,
		   -- Same for coming back early.
		   away_until = CASE WHEN ? THEN ? ELSE away_until END,
		   browse_prefs = CASE WHEN ? THEN ? ELSE browse_prefs END
		 WHERE id = ?`,
	)
		.bind(
			displayName ?? null,
			language ?? null,
			area ? areaName(area.label) : null,
			snapped?.lat ?? null,
			snapped?.lng ?? null,
			lendLimit === undefined ? 0 : 1,
			lendLimit ?? null,
			awayUntil === undefined ? 0 : 1,
			awayUntil ?? null,
			browsePrefs === undefined ? 0 : 1,
			browsePrefs || null,
			member.id,
		)
		.run();
	// Away: nobody can meet them, so holds on their copies are lifted. Back
	// early: their free copies are offered to whoever waits for them.
	if (awayUntil !== undefined) {
		if (awayUntil !== null && awayUntil > now()) {
			await c.env.DB.prepare(
				`UPDATE waitlist SET offered_copy_id = NULL, offer_expires_at = NULL
				  WHERE offered_copy_id IN (SELECT id FROM copies WHERE owner_id = ?)`,
			)
				.bind(member.id)
				.run();
		} else {
			c.executionCtx.waitUntil(offerWaitedFor(c.env).catch(() => undefined));
		}
	}
	return c.body(null, 204);
});

/** Moderators only. The plain token is returned once; only its hash is kept. */
/**
 * Anyone may bring a neighbour in — that is how the community grows, and a
 * member vouching for someone they know is the whole of our vetting. A
 * member's invite is for one person and a fortnight; a moderator's can be a
 * batch, for a WhatsApp group.
 */
/** The join page asks what became of its invite before promising an email. */
auth.post("/v1/invites/state", async (c) => {
	const body = (await c.req.json().catch(() => null)) as {
		token?: string;
	} | null;
	if (!body?.token) return json(c, problem(422, "Which invite?"));
	const limit = await take(c.env, {
		bucket: "invite_state:ip",
		subject: callerIp(c.req.raw),
		allow: 60,
		per: 60 * 60,
	});
	if (!limit.ok) return json(c, problem(429, "Too many checks"));
	return c.json({ state: await inviteState(c.env, body.token) });
});

auth.post("/v1/invites", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.scopes.includes("shelf:write")) return denied(c, true);
	const isModerator = Boolean(await moderator(c));

	const parsed = CreateInvite.safeParse(
		(await c.req.json().catch(() => null)) ?? {},
	);
	if (!parsed.success) return json(c, problem(422, "Invalid invite"));
	// The library's own limits for members' links, set by its admin.
	const limits = await c.env.DB.prepare(
		"SELECT member_invites_open, member_invite_days FROM communities WHERE id = ?",
	)
		.bind(member.communityId)
		.first<{ member_invites_open: number; member_invite_days: number }>();
	const allowed = limits?.member_invites_open ?? 5;
	const maxUses = isModerator ? parsed.data.maxUses : 1;
	const days = isModerator
		? parsed.data.days
		: Math.min(parsed.data.days, limits?.member_invite_days ?? 14);

	if (!isModerator) {
		if (allowed === 0)
			return json(
				c,
				problem(403, "Invites are by moderators here", "Ask a moderator"),
			);
		// A handful of open invites at a time: enough for the neighbours you
		// mean to ask, not enough to paper the internet with.
		const open = await c.env.DB.prepare(
			`SELECT count(*) AS n FROM invites
			  WHERE created_by = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses`,
		)
			.bind(member.id, now())
			.first<{ n: number }>();
		if ((open?.n ?? 0) >= allowed) {
			return json(
				c,
				problem(
					409,
					"Too many open invites",
					"Wait for one to be used, or withdraw one",
				),
			);
		}
	}

	const invite = await createInvite(
		c.env,
		member.communityId,
		member.id,
		maxUses,
		days,
	);
	return c.json(
		{
			id: invite.id,
			token: invite.token,
			url: `${c.env.APP_URL}/join?invite=${encodeURIComponent(invite.token)}`,
			maxUses,
			expiresAt: invite.expiresAt,
		},
		201,
	);
});

/** The invites I have out, and who has come in on them. */
/** The same figures as a book's, added up over everything a member owns. */
auth.get("/v1/me/stats", async (c) => {
	const { member, forbidden } = await viewerWith(c, "profile:read");
	if (!member) return denied(c, forbidden);
	const row = await c.env.DB.prepare(
		`SELECT
		   (SELECT created_at FROM members WHERE id = ?1) AS member_since,
		   (SELECT count(*) FROM copies WHERE owner_id = ?1 AND state != 'retired') AS books,
		   (SELECT count(*) FROM loans WHERE lender_id = ?1 AND started_at IS NOT NULL) AS lent,
		   (SELECT count(DISTINCT borrower_id) FROM loans
		     WHERE lender_id = ?1 AND started_at IS NOT NULL) AS readers,
		   (SELECT coalesce(sum(coalesce(closed_at, unixepoch()) - started_at), 0) FROM loans
		     WHERE lender_id = ?1 AND started_at IS NOT NULL) AS seconds_out,
		   (SELECT count(*) FROM loans WHERE borrower_id = ?1 AND started_at IS NOT NULL) AS borrowed,
		   (SELECT count(*) FROM loans WHERE lender_id = ?1 AND status = 'active') AS out_now,
		   (SELECT count(*) FROM loans WHERE borrower_id = ?1 AND status = 'active') AS borrowed_now`,
	)
		.bind(member.id)
		.first<{
			member_since: number;
			books: number;
			lent: number;
			readers: number;
			seconds_out: number;
			borrowed: number;
			out_now: number;
			borrowed_now: number;
		}>();

	return c.json({
		memberSince: row?.member_since ?? 0,
		books: row?.books ?? 0,
		lent: row?.lent ?? 0,
		daysOut: Math.floor((row?.seconds_out ?? 0) / 86_400),
		readers: row?.readers ?? 0,
		borrowed: row?.borrowed ?? 0,
		outNow: row?.out_now ?? 0,
		borrowedNow: row?.borrowed_now ?? 0,
	});
});

auth.get("/v1/me/invites", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.scopes.includes("profile:read")) return denied(c, true);
	const { results } = await c.env.DB.prepare(
		`SELECT i.id, i.max_uses, i.uses, i.expires_at, i.created_at, i.revoked_at,
		        (SELECT group_concat(m.id || ':' || m.display_name, char(31))
		           FROM members m WHERE m.invited_via = i.id) AS joined
		   FROM invites i
		  WHERE i.created_by = ? AND i.revoked_at IS NULL AND i.expires_at > ?
		  ORDER BY i.created_at DESC LIMIT 20`,
	)
		.bind(member.id, now())
		.all<{
			id: string;
			max_uses: number;
			uses: number;
			expires_at: number;
			created_at: number;
			revoked_at: number | null;
			joined: string | null;
		}>();

	return c.json({
		invites: results.map((row) => ({
			id: row.id,
			maxUses: row.max_uses,
			uses: row.uses,
			expiresAt: row.expires_at,
			createdAt: row.created_at,
			revokedAt: row.revoked_at,
			joined: (row.joined ?? "")
				.split("\u001f")
				.filter(Boolean)
				.map((entry) => {
					const [id, ...rest] = entry.split(":");
					return { id: id ?? "", displayName: rest.join(":") };
				}),
		})),
	});
});

auth.post("/v1/me/invites/:id/revoke", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.scopes.includes("shelf:write")) return denied(c, true);
	const result = await c.env.DB.prepare(
		"UPDATE invites SET revoked_at = ? WHERE id = ? AND created_by = ? AND revoked_at IS NULL",
	)
		.bind(now(), c.req.param("id"), member.id)
		.run();
	return result.meta.changes
		? c.body(null, 204)
		: json(c, problem(404, "No such invite"));
});
