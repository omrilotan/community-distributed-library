import { Hono, type Context } from "hono";
import {
	ASK_LIMIT,
	ASK_OPEN_DAYS,
	CreateAsk,
	CreateOffer,
	KEEP_PROMPT_DAYS,
	KeepAnswer,
	problem,
	traits,
	type AskBy,
	type AskDetail,
	type AskView,
	type KeepPrompt,
	type MyAsks,
	type OfferCome,
	type OfferView,
	type Period,
	log,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewerWith, type Viewer } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { denied, json } from "./problem.ts";
import { theLibrary } from "./library.ts";
import { countPushes, PUSH_REFUSALS, tell } from "./notify.ts";
import { emit } from "./events.ts";
import { searchKey } from "./normalise.ts";
import { linkWork } from "./community-catalogue.ts";
import { forget, vocabularyKey } from "./cache.ts";
import { handoffCode } from "./routes-handoffs.ts";

/**
 * Asks: "does anyone have a saw I could borrow today?" A member names a kind
 * of thing; neighbours who have one offer theirs, on a shelf or not; the
 * asker takes one offer, and that is an accepted loan. Whatever was offered
 * stays off every shelf until its owner says to keep it there.
 */
export const asks = new Hono<{ Bindings: Env }>();

const DAY = 86_400;

/** The day as the rest of the handoffs count it. */
const today = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);

/** When an ask made now is over: today's with the day, the rest after their days. */
function expiry(by: AskBy, at = Date.now()): number {
	if (by !== "today") return Math.floor(at / 1000) + ASK_OPEN_DAYS[by] * DAY;
	const date = new Date(at);
	return Math.floor(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) /
			1000,
	);
}

/**
 * The part of the day a time falls in. "Until 12:00" is still the morning,
 * so `now` counts the hour it ends on with the part before it.
 */
export function periodOf(come: OfferCome, time: string): Period {
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	const at = hour + minute / 60 - (come === "now" ? 0.01 : 0);
	return at < 12 ? "morning" : at < 17 ? "afternoon" : "evening";
}

/** Whether this library takes asks at all; 404 where it does not. */
async function asksHere(c: Context<{ Bindings: Env }>) {
	return traits((await theLibrary(c.env)).type).asks;
}
const notHere = () =>
	problem(404, "No asks here", "This library does not take asks");

interface AskRow {
	id: string;
	member_id: string;
	what: string;
	note: string | null;
	needed_by: AskBy;
	days: number;
	status: "open" | "taken" | "closed";
	created_at: number;
	expires_at: number;
	closed_at: number | null;
	asker_name: string;
	offer_count: number;
}

interface OfferRow {
	id: string;
	ask_id: string;
	member_id: string;
	name: string;
	come: OfferCome;
	time: string | null;
	day: string;
	note: string | null;
	status: "offered" | "taken" | "withdrawn";
	loan_id: string | null;
	by_name: string;
}

const isOpen = (ask: { status: string; expires_at: number }, at: number) =>
	ask.status === "open" && ask.expires_at > at;

function offerView(row: OfferRow, askOpen: boolean): OfferView {
	return {
		id: row.id,
		name: row.name,
		come: row.come,
		time: row.time,
		day: row.day,
		note: row.note,
		// Still on the table only while the ask is; after that it was passed over.
		status: row.status === "offered" && !askOpen ? "passed" : row.status,
		by: { id: row.member_id, displayName: row.by_name },
		loanId: row.loan_id,
	};
}

const ASK_COLUMNS = `a.id, a.member_id, a.what, a.note, a.needed_by, a.days, a.status, a.created_at,
	a.expires_at, a.closed_at, m.display_name AS asker_name,
	(SELECT count(*) FROM ask_offers o WHERE o.ask_id = a.id AND o.status = 'offered') AS offer_count`;

/** Asks as the viewer may see them: everyone's ask, their own offer, and the offers on their own asks. */
async function asksWhere(
	env: Env,
	member: Viewer,
	where: string,
	binds: unknown[],
): Promise<AskView[]> {
	const { results } = await env.DB.prepare(
		`SELECT ${ASK_COLUMNS}
		   FROM asks a JOIN members m ON m.id = a.member_id
		  WHERE a.community_id = ? AND ${where}
		  ORDER BY CASE a.needed_by WHEN 'today' THEN 0 WHEN 'week' THEN 1 ELSE 2 END, a.created_at DESC
		  LIMIT 50`,
	)
		.bind(member.communityId, ...binds)
		.all<AskRow>();
	if (!results.length) return [];
	const offers = await env.DB.prepare(
		`SELECT o.id, o.ask_id, o.member_id, o.name, o.come, o.time, o.day, o.note, o.status, o.loan_id,
		        m.display_name AS by_name
		   FROM ask_offers o JOIN members m ON m.id = o.member_id
		  WHERE o.ask_id IN (SELECT value FROM json_each(?)) AND o.status != 'withdrawn'
		  ORDER BY o.created_at`,
	)
		.bind(JSON.stringify(results.map((row) => row.id)))
		.all<OfferRow>();
	const at = now();
	return results.map((row) => {
		const open = isOpen(row, at);
		const mine = row.member_id === member.id;
		const theirs = offers.results.filter((offer) => offer.ask_id === row.id);
		const own = theirs.find((offer) => offer.member_id === member.id);
		return {
			id: row.id,
			what: row.what,
			note: row.note,
			by: row.needed_by,
			days: row.days,
			status: open ? "open" : row.status === "taken" ? "taken" : "closed",
			createdAt: row.created_at,
			expiresAt: row.expires_at,
			asker: { id: row.member_id, displayName: row.asker_name },
			mine,
			offerCount: open ? row.offer_count : 0,
			myOffer: own ? offerView(own, open) : null,
			// The asker alone sees who offered what: an offer is made to them.
			offers: mine ? theirs.map((offer) => offerView(offer, open)) : [],
		};
	});
}

/** Asks still open, from members still here: the soonest needed first. */
asks.get("/v1/asks", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	if (!(await asksHere(c))) return c.json({ asks: [] });
	return c.json({
		asks: await asksWhere(
			c.env,
			member,
			`a.status = 'open' AND a.expires_at > ?
			 AND EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = a.member_id
			              AND ms.community_id = a.community_id AND ms.status = 'active')`,
			[now()],
		),
	});
});

/** Ask the neighbours. Those asked for today are told at once, on their phones. */
asks.post("/v1/asks", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	if (!(await asksHere(c))) return json(c, notHere());
	const parsed = CreateAsk.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid ask"));
	const { what, note, by, days } = parsed.data;

	const id = ulid();
	const at = now();
	// Counted when written, so two asks sent together cannot both slip under.
	const made = await c.env.DB.prepare(
		`INSERT INTO asks (id, community_id, member_id, what, note, needed_by, days, status, created_at, expires_at)
		 SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?9
		  WHERE (SELECT count(*) FROM asks WHERE member_id = ?3 AND status = 'open' AND expires_at > ?8) < ?10`,
	)
		.bind(
			id,
			member.communityId,
			member.id,
			what,
			note || null,
			by,
			days,
			at,
			expiry(by),
			ASK_LIMIT,
		)
		.run();
	if (!made.meta.changes)
		return json(
			c,
			problem(
				409,
				"Too many asks",
				`You can have ${ASK_LIMIT} asks open at once; close one first`,
			),
		);
	if (by === "today")
		c.executionCtx.waitUntil(
			announce(c.env, member, id, what).catch((error: unknown) =>
				log.error("asks.announce_failed", {}, error),
			),
		);
	return c.json({ id }, 201);
});

/**
 * Today's ask, to the phones of members who asked to be told things there.
 * Never by email: an ask is one neighbour's need, not the library's news,
 * and nobody's inbox fills because a neighbour wants a saw.
 */
async function announce(env: Env, asker: Viewer, askId: string, what: string) {
	const [who, subscribers] = await Promise.all([
		env.DB.prepare("SELECT display_name FROM members WHERE id = ?")
			.bind(asker.id)
			.first<{ display_name: string }>(),
		env.DB.prepare(
			`SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, m.id AS member_id, m.email, m.locale
			   FROM push_subscriptions ps
			   JOIN members m ON m.id = ps.member_id
			   JOIN memberships ms ON ms.member_id = m.id AND ms.community_id = ?1 AND ms.status = 'active'
			  WHERE ps.failures < ?2 AND m.id != ?3
			    AND (m.away_until IS NULL OR m.away_until <= ?4)`,
		)
			.bind(asker.communityId, PUSH_REFUSALS, asker.id, now())
			.all<{
				id: string;
				endpoint: string;
				p256dh: string;
				auth: string;
				member_id: string;
				email: string;
				locale: "en" | "he";
			}>(),
	]);
	if (!who) return;
	const byMember = new Map<string, typeof subscribers.results>();
	for (const row of subscribers.results)
		byMember.set(row.member_id, [...(byMember.get(row.member_id) ?? []), row]);
	for (const devices of byMember.values()) {
		const first = devices[0]!;
		const outcome = await env.NOTIFY.push(
			devices.map(({ id, endpoint, p256dh, auth }) => ({
				id,
				endpoint,
				p256dh,
				auth,
			})),
			{
				kind: "ask",
				to: first.email,
				locale: first.locale,
				url: `${env.APP_URL}/asks/${askId}`,
				stage: "new",
				what,
				otherName: who.display_name,
				offered: null,
				by: "today",
			},
		).catch((error: unknown) => {
			log.error("asks.push_failed", {}, error);
			return null;
		});
		if (outcome) await countPushes(env, outcome);
	}
}

/** One ask, open or over, with what the offer form needs to know of the viewer. */
asks.get("/v1/asks/:id", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	const [ask] = await asksWhere(c.env, member, "a.id = ?", [c.req.param("id")]);
	if (!ask) return json(c, problem(404, "No such ask"));
	const me = await c.env.DB.prepare(
		`SELECT meeting_place,
		        EXISTS (SELECT 1 FROM availability WHERE member_id = ?1) AS has_times
		   FROM members WHERE id = ?1`,
	)
		.bind(member.id)
		.first<{ meeting_place: string | null; has_times: number }>();
	const detail: AskDetail = {
		...ask,
		placeMissing: !me?.meeting_place,
		hasUsualTimes: me?.has_times === 1,
	};
	return c.json(detail);
});

/** The asker has it, or no longer needs it. Whoever offered is thanked. */
asks.post("/v1/asks/:id/close", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");
	const at = now();
	const closed = await c.env.DB.prepare(
		`UPDATE asks SET status = 'closed', closed_at = ?1
		  WHERE id = ?2 AND member_id = ?3 AND status = 'open' AND expires_at > ?1`,
	)
		.bind(at, id, member.id)
		.run();
	if (!closed.meta.changes) return json(c, problem(404, "No such open ask"));
	c.executionCtx.waitUntil(
		thank(c.env, id, null).catch((error: unknown) =>
			log.error("asks.notify_failed", {}, error),
		),
	);
	return c.body(null, 204);
});

/** Tell everyone whose offer was not the one taken that it is sorted. */
async function thank(env: Env, askId: string, takenOfferId: string | null) {
	const { results } = await env.DB.prepare(
		`SELECT m.email, m.locale, a.what, asker.display_name AS asker_name
		   FROM ask_offers o
		   JOIN asks a ON a.id = o.ask_id
		   JOIN members m ON m.id = o.member_id
		   JOIN members asker ON asker.id = a.member_id
		  WHERE o.ask_id = ?1 AND o.status = 'offered' AND o.id IS NOT ?2`,
	)
		.bind(askId, takenOfferId)
		.all<{
			email: string;
			locale: "en" | "he";
			what: string;
			asker_name: string;
		}>();
	await Promise.all(
		results.map((row) =>
			tell(env, {
				kind: "ask",
				to: row.email,
				locale: row.locale,
				url: `${env.APP_URL}/loans`,
				stage: "sorted",
				what: row.what,
				otherName: row.asker_name,
				offered: null,
				by: null,
			}),
		),
	);
}

/** "I have one": what theirs is, and when the asker may come by. */
asks.post("/v1/asks/:id/offers", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	if (!(await asksHere(c))) return json(c, notHere());
	const parsed = CreateOffer.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid offer"));
	const { name, come, time, note, meetingPlace } = parsed.data;

	const at = now();
	const ask = await c.env.DB.prepare(
		`SELECT a.id, a.member_id, a.what, a.status, a.expires_at, m.email, m.locale,
		        (SELECT display_name FROM members WHERE id = ?1) AS my_name,
		        (SELECT meeting_place FROM members WHERE id = ?1) AS my_place
		   FROM asks a JOIN members m ON m.id = a.member_id
		  WHERE a.id = ?2 AND a.community_id = ?3
		    AND EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = a.member_id
		                 AND ms.community_id = a.community_id AND ms.status = 'active')`,
	)
		.bind(member.id, c.req.param("id"), member.communityId)
		.first<{
			id: string;
			member_id: string;
			what: string;
			status: string;
			expires_at: number;
			email: string;
			locale: "en" | "he";
			my_name: string;
			my_place: string | null;
		}>();
	if (!ask) return json(c, problem(404, "No such ask"));
	if (!isOpen(ask, at))
		return json(c, problem(409, "No longer open", "This ask is over"));
	if (ask.member_id === member.id)
		return json(c, problem(409, "That is your own ask"));
	// "Come by now" needs somewhere to come to.
	if (come !== "usual" && !ask.my_place && !meetingPlace)
		return json(
			c,
			problem(422, "Say where", "Say where to come, so they can find you"),
		);

	const id = ulid();
	const [made] = await c.env.DB.batch([
		// One offer a member on an ask; one taken back may be made again.
		c.env.DB.prepare(
			`INSERT INTO ask_offers (id, ask_id, member_id, name, come, time, day, note, status, created_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'offered', ?9)
			 ON CONFLICT (ask_id, member_id) DO UPDATE
			    SET name = excluded.name, come = excluded.come, time = excluded.time, day = excluded.day,
			        note = excluded.note, status = 'offered', created_at = excluded.created_at
			  WHERE ask_offers.status = 'withdrawn'`,
		).bind(
			id,
			ask.id,
			member.id,
			name,
			come,
			come === "usual" ? null : (time ?? null),
			today(),
			note || null,
			at,
		),
		// Where they hand things over, said here for the first time: theirs from now on.
		...(meetingPlace && !ask.my_place
			? [
					c.env.DB.prepare(
						"UPDATE members SET meeting_place = ? WHERE id = ? AND meeting_place IS NULL",
					).bind(meetingPlace, member.id),
				]
			: []),
	]);
	if (!made?.meta.changes)
		return json(c, problem(409, "Already offered", "You offered yours"));
	const offer = await c.env.DB.prepare(
		"SELECT id FROM ask_offers WHERE ask_id = ? AND member_id = ?",
	)
		.bind(ask.id, member.id)
		.first<{ id: string }>();
	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "ask",
			to: ask.email,
			locale: ask.locale,
			url: `${c.env.APP_URL}/loans`,
			stage: "offer",
			what: ask.what,
			otherName: ask.my_name,
			offered: name,
			by: null,
		}).catch((error: unknown) => log.error("asks.notify_failed", {}, error)),
	);
	return c.json({ id: offer?.id ?? id }, 201);
});

/**
 * The asker takes an offer, and it is a loan: accepted, of a copy made for
 * it that is on no shelf. "Come by now" or "later today", said today, is the
 * meeting already agreed, so the place and the code are there at once; any
 * other time is arranged the way every loan's is.
 */
asks.post("/v1/asks/:id/offers/:offerId/take", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const askId = c.req.param("id");
	const offerId = c.req.param("offerId");
	const at = now();
	const offer = await c.env.DB.prepare(
		`SELECT o.member_id, o.name, o.come, o.time, o.day, a.what, a.note, a.days,
		        m.email, m.locale,
		        (SELECT display_name FROM members WHERE id = a.member_id) AS asker_name,
		        EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = o.member_id
		                 AND ms.community_id = a.community_id AND ms.status = 'active') AS lender_active
		   FROM ask_offers o
		   JOIN asks a ON a.id = o.ask_id
		   JOIN members m ON m.id = o.member_id
		  WHERE o.id = ?1 AND o.ask_id = ?2 AND o.status = 'offered'
		    AND a.member_id = ?3 AND a.community_id = ?4 AND a.status = 'open' AND a.expires_at > ?5`,
	)
		.bind(offerId, askId, member.id, member.communityId, at)
		.first<{
			member_id: string;
			name: string;
			come: OfferCome;
			time: string | null;
			day: string;
			what: string;
			note: string | null;
			days: number;
			email: string;
			locale: "en" | "he";
			asker_name: string;
			lender_active: number;
		}>();
	if (!offer) return json(c, problem(404, "No such offer"));
	if (!offer.lender_active)
		return json(
			c,
			problem(409, "Not available", "This offer cannot be taken right now"),
		);

	const workId = ulid();
	const editionId = ulid();
	const copyId = ulid();
	const loanId = ulid();
	const key = searchKey(offer.name);
	// Every row after the first is written only if this take was the one that
	// closed the ask: a second tap, or another offer taken in the same moment,
	// leaves nothing half made. The offer is marked last, so until then it
	// still reads as offered, which is what tells this take from an earlier one.
	const taken = `EXISTS (SELECT 1 FROM asks a JOIN ask_offers o ON o.id = a.taken_offer_id
	                        WHERE a.id = ?1 AND o.id = ?2 AND o.status = 'offered')`;
	const meetsToday =
		offer.come !== "usual" && offer.time !== null && offer.day === today();
	const [won] = await c.env.DB.batch([
		c.env.DB.prepare(
			`UPDATE asks SET status = 'taken', taken_offer_id = ?2, closed_at = ?3
			  WHERE id = ?1 AND member_id = ?4 AND status = 'open' AND expires_at > ?3
			    AND EXISTS (SELECT 1 FROM ask_offers WHERE id = ?2 AND status = 'offered')`,
		).bind(askId, offerId, at, member.id),
		c.env.DB.prepare(
			`INSERT INTO works (id, title, authors, search_key, created_at)
			 SELECT ?3, ?4, '[]', ?5, ?6 WHERE ${taken}`,
		).bind(askId, offerId, workId, offer.name, key, at),
		c.env.DB.prepare(
			`INSERT INTO editions (id, work_id, isbn13, title, cover_url, search_key, created_at)
			 SELECT ?3, ?4, NULL, ?5, NULL, ?6, ?7 WHERE ${taken}`,
		).bind(askId, offerId, editionId, workId, offer.name, key, at),
		// Reserved from the start, and lent for as long as was asked. No
		// copy_shares row: it is on nobody's shelf.
		c.env.DB.prepare(
			`INSERT INTO copies
			   (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, loan_days,
			    quantity, search_key, created_at)
			 SELECT ?3, ?4, ?5, 'reserved', ?5, 'good', 'lendable', 0, ?6, 1, ?7, ?8 WHERE ${taken}`,
		).bind(
			askId,
			offerId,
			copyId,
			editionId,
			offer.member_id,
			offer.days,
			key,
			at,
		),
		c.env.DB.prepare(
			`INSERT INTO loans (id, copy_id, borrower_id, lender_id, community_id, status, message, requested_at, decided_at)
			 SELECT ?3, ?4, ?5, ?6, ?7, 'accepted', ?8, ?9, ?9 WHERE ${taken}`,
		).bind(
			askId,
			offerId,
			loanId,
			copyId,
			member.id,
			offer.member_id,
			member.communityId,
			offer.note,
			at,
		),
		...(meetsToday
			? [
					c.env.DB.prepare(
						`INSERT INTO handoffs (id, loan_id, direction, day, period, proposed_by, status, code, created_at, agreed_at)
						 SELECT ?3, ?4, 'out', ?5, ?6, ?7, 'agreed', ?8, ?9, ?9 WHERE ${taken}`,
					).bind(
						askId,
						offerId,
						ulid(),
						loanId,
						offer.day,
						periodOf(offer.come, offer.time!),
						offer.member_id,
						handoffCode(),
						at,
					),
				]
			: []),
		c.env.DB.prepare(
			`UPDATE ask_offers SET status = 'taken', copy_id = ?3, loan_id = ?4
			  WHERE id = ?2 AND status = 'offered'
			    AND EXISTS (SELECT 1 FROM asks WHERE id = ?1 AND taken_offer_id = ?2)
			    AND EXISTS (SELECT 1 FROM loans WHERE id = ?4)`,
		).bind(askId, offerId, copyId, loanId),
	]);
	if (!won?.meta.changes)
		return json(c, problem(409, "No longer open", "This ask is over"));

	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "loan.accepted", { loanId }),
	);
	c.executionCtx.waitUntil(
		Promise.all([
			tell(c.env, {
				kind: "ask",
				to: offer.email,
				locale: offer.locale,
				url: `${c.env.APP_URL}/loans/${loanId}`,
				stage: "taken",
				what: offer.what,
				otherName: offer.asker_name,
				offered: offer.name,
				by: null,
			}),
			thank(c.env, askId, offerId),
		]).catch((error: unknown) => log.error("asks.notify_failed", {}, error)),
	);
	return c.json({ loanId }, 201);
});

/** Take an offer back, while nobody has taken it. */
asks.post("/v1/ask-offers/:id/withdraw", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const withdrawn = await c.env.DB.prepare(
		"UPDATE ask_offers SET status = 'withdrawn' WHERE id = ? AND member_id = ? AND status = 'offered'",
	)
		.bind(c.req.param("id"), member.id)
		.run();
	if (!withdrawn.meta.changes) return json(c, problem(404, "No such offer"));
	return c.body(null, 204);
});

/**
 * What an owner may still be asked about: something lent through an ask and
 * back with them, or offered and passed over in the last few days. Asked
 * once; a copy they have since removed has answered for them.
 */
const KEEP_OPEN = `o.keep IS NULL AND (
	(o.status = 'taken'
	  AND EXISTS (SELECT 1 FROM loans l WHERE l.id = o.loan_id AND l.status IN ('completed', 'cancelled'))
	  AND EXISTS (SELECT 1 FROM copies c WHERE c.id = o.copy_id AND c.state = 'shelved')
	  AND NOT EXISTS (SELECT 1 FROM copy_shares cs WHERE cs.copy_id = o.copy_id))
	OR (o.status = 'offered'
	  AND NOT (a.status = 'open' AND a.expires_at > ?1)
	  AND coalesce(a.closed_at, a.expires_at) > ?1 - ${KEEP_PROMPT_DAYS * DAY}))`;

/** "Keep it on your shelf?" Yes lists it for the neighbours; no leaves no trace. */
asks.post("/v1/ask-offers/:id/keep", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const parsed = KeepAnswer.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid answer"));
	const at = now();
	const offer = await c.env.DB.prepare(
		`SELECT o.id, o.name, o.status, o.copy_id,
		        (SELECT e.work_id FROM copies c JOIN editions e ON e.id = c.edition_id
		          WHERE c.id = o.copy_id) AS work_id
		   FROM ask_offers o JOIN asks a ON a.id = o.ask_id
		  WHERE o.id = ?2 AND o.member_id = ?3 AND a.community_id = ?4 AND ${KEEP_OPEN}`,
	)
		.bind(at, c.req.param("id"), member.id, member.communityId)
		.first<{
			id: string;
			name: string;
			status: "offered" | "taken";
			copy_id: string | null;
			work_id: string | null;
		}>();
	if (!offer) return json(c, problem(404, "Nothing to decide"));

	const answered = (copyId: string | null) =>
		c.env.DB.prepare(
			"UPDATE ask_offers SET keep = ?1, copy_id = coalesce(?2, copy_id) WHERE id = ?3 AND keep IS NULL",
		).bind(parsed.data.keep ? 1 : 0, copyId, offer.id);

	if (!parsed.data.keep) {
		await c.env.DB.batch([
			answered(null),
			// Lent once and not kept: gone from their own shelf too.
			...(offer.copy_id
				? [
						c.env.DB.prepare(
							"UPDATE copies SET state = 'retired' WHERE id = ? AND owner_id = ? AND state = 'shelved'",
						).bind(offer.copy_id, member.id),
					]
				: []),
		]);
		return c.json({ copyId: null, workId: null });
	}

	let copyId = offer.copy_id;
	let workId = offer.work_id;
	if (copyId && workId) {
		// It was lent: the same copy goes on the shelf, lent from now on for as
		// long as its owner's other things are.
		await c.env.DB.batch([
			answered(null),
			c.env.DB.prepare(
				"INSERT OR IGNORE INTO copy_shares (copy_id, community_id) VALUES (?, ?)",
			).bind(copyId, member.communityId),
			c.env.DB.prepare("UPDATE copies SET loan_days = NULL WHERE id = ?").bind(
				copyId,
			),
			linkWork(c.env, workId, member.communityId),
		]);
	} else {
		// Offered and never lent: it is made now, as adding it by hand would.
		workId = ulid();
		copyId = ulid();
		const editionId = ulid();
		const key = searchKey(offer.name);
		await c.env.DB.batch([
			c.env.DB.prepare(
				"INSERT INTO works (id, title, authors, search_key, created_at) VALUES (?, ?, '[]', ?, ?)",
			).bind(workId, offer.name, key, at),
			c.env.DB.prepare(
				`INSERT INTO editions (id, work_id, isbn13, title, cover_url, search_key, created_at)
				 VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
			).bind(editionId, workId, offer.name, key, at),
			c.env.DB.prepare(
				`INSERT INTO copies
				   (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, quantity, search_key, created_at)
				 VALUES (?1, ?2, ?3, 'shelved', ?3, 'good', 'lendable', 0, 1, ?4, ?5)`,
			).bind(copyId, editionId, member.id, key, at),
			c.env.DB.prepare(
				"INSERT INTO copy_shares (copy_id, community_id) VALUES (?, ?)",
			).bind(copyId, member.communityId),
			linkWork(c.env, workId, member.communityId),
			// Last: the offer points at a copy that is there by now.
			answered(copyId),
		]);
	}
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.listed", { copyId }),
	);
	await forget(c.env, vocabularyKey(member.communityId));
	return c.json({ copyId, workId });
});

/** Asks on the loans page: mine, my offers still waiting, and what to decide. */
asks.get("/v1/me/asks", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const empty: MyAsks = { asks: [], offers: [], keep: [] };
	if (!(await asksHere(c))) return c.json(empty);
	const at = now();
	const [mine, offered, keep] = await Promise.all([
		asksWhere(
			c.env,
			member,
			"a.member_id = ? AND a.status = 'open' AND a.expires_at > ?",
			[member.id, at],
		),
		asksWhere(
			c.env,
			member,
			`a.status = 'open' AND a.expires_at > ?
			 AND EXISTS (SELECT 1 FROM ask_offers o WHERE o.ask_id = a.id AND o.member_id = ? AND o.status = 'offered')`,
			[at, member.id],
		),
		c.env.DB.prepare(
			`SELECT o.id, o.name, o.status, a.what, m.display_name AS asker_name
			   FROM ask_offers o
			   JOIN asks a ON a.id = o.ask_id
			   JOIN members m ON m.id = a.member_id
			  WHERE o.member_id = ?2 AND a.community_id = ?3 AND ${KEEP_OPEN}
			  ORDER BY o.created_at DESC LIMIT 10`,
		)
			.bind(at, member.id, member.communityId)
			.all<{
				id: string;
				name: string;
				status: "offered" | "taken";
				what: string;
				asker_name: string;
			}>(),
	]);
	const answer: MyAsks = {
		asks: mine,
		offers: offered.flatMap((ask) =>
			ask.myOffer
				? [
						{
							offer: ask.myOffer,
							ask: {
								id: ask.id,
								what: ask.what,
								by: ask.by,
								days: ask.days,
								asker: ask.asker,
							},
						},
					]
				: [],
		),
		keep: keep.results.map((row): KeepPrompt => ({
			offerId: row.id,
			name: row.name,
			after: row.status === "taken" ? "returned" : "passed",
			askerName: row.asker_name,
			what: row.what,
		})),
	};
	return c.json(answer);
});
