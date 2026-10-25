import type { Env } from "./env.ts";
import { tell } from "./notify.ts";
import { ulid, now } from "./ids.ts";
import { linkWork } from "./community-catalogue.ts";
import { CLAIMED } from "./sets.ts";

export const HOLD_HOURS = 48;
/**
 * A copy just became requestable. If anyone is waiting for its work, the
 * head of the queue gets first dibs for HOLD_HOURS; others see "held".
 * Called after returns, cancellations, new listings and un-pausing.
 */
export async function onCopyAvailable(
	env: Env,
	copyId: string,
	/** Someone who just let a hold on it lapse: not straight back to them. */
	skip: string | null = null,
): Promise<void> {
	const copy = await env.DB.prepare(
		`SELECT c.id, c.owner_id, e.work_id, e.title, m.display_name AS owner_name,
		        c.quantity, c.quantity - ${CLAIMED} AS free,
		        (SELECT community_id FROM copy_shares WHERE copy_id = c.id LIMIT 1) AS community_id
		   FROM copies c JOIN editions e ON e.id = c.edition_id JOIN members m ON m.id = c.owner_id
		  WHERE c.id = ? AND c.state = 'shelved' AND c.lending = 'lendable'
		    AND (m.away_until IS NULL OR m.away_until <= unixepoch())
		    AND EXISTS (SELECT 1 FROM memberships om JOIN copy_shares ocs ON ocs.community_id = om.community_id
		                 WHERE om.member_id = c.owner_id AND ocs.copy_id = c.id AND om.status = 'active')`,
	)
		.bind(copyId)
		.first<{
			id: string;
			owner_id: string;
			work_id: string;
			title: string;
			owner_name: string;
			quantity: number;
			free: number;
			community_id: string | null;
		}>();
	if (!copy?.community_id) return;

	// Part of a set came free. Nobody is held for it, which would bar everyone
	// else from the rest of the set: the head of the queue hears, and asks.
	if (copy.quantity > 1) {
		if (copy.free < 1) return;
		const head = await queueHead(env, copy, skip);
		if (!head) return tellWishers(env, copy);
		await tell(env, {
			kind: "wishlist_available",
			to: head.email,
			locale: head.locale,
			url: `${env.APP_URL}/works/${copy.work_id}`,
			bookTitle: copy.title,
			ownerName: copy.owner_name,
		}).catch((error: unknown) =>
			console.error("[waitlist] notify failed", error),
		);
		return;
	}

	// Already asked for (a relay that became an ordinary request on its
	// return): the asker is first, so nobody is held for.
	const asked = await env.DB.prepare(
		"SELECT 1 FROM loans WHERE copy_id = ? AND status IN ('requested', 'accepted') AND of_set = 0",
	)
		.bind(copyId)
		.first();
	if (asked) return;

	// Is this copy already held for someone? Then nothing to do.
	const held = await env.DB.prepare(
		"SELECT 1 FROM waitlist WHERE offered_copy_id = ? AND offer_expires_at > ?",
	)
		.bind(copyId, now())
		.first();
	if (held) return;
	// A hold on it that lapsed before the daily pass got to it: lapse it now,
	// as that pass would, so the copy is held for one member at a time.
	const lapsed = await env.DB.prepare(
		`UPDATE waitlist SET offered_copy_id = NULL, offer_expires_at = NULL, created_at = ?1
		  WHERE offered_copy_id = ?2 AND offer_expires_at <= ?1
		  RETURNING member_id`,
	)
		.bind(now(), copyId)
		.first<{ member_id: string }>();

	const head = await queueHead(env, copy, skip ?? lapsed?.member_id ?? null);
	// Nobody queued for it: whoever keeps it on their wishlist hears instead.
	if (!head) {
		await tellWishers(env, copy);
		return;
	}

	const until = now() + HOLD_HOURS * 3600;
	// Only if nobody holds it yet, the head included: two passes for one copy
	// at once must not both hold it and both tell the head.
	const offered = await env.DB.prepare(
		`UPDATE waitlist SET offered_copy_id = ?1, offer_expires_at = ?2
		  WHERE id = ?3 AND (offered_copy_id IS NULL OR offer_expires_at < ?4)
		    AND NOT EXISTS (SELECT 1 FROM waitlist h WHERE h.offered_copy_id = ?1 AND h.offer_expires_at > ?4)`,
	)
		.bind(copyId, until, head.id, now())
		.run();
	if (!offered.meta.changes) return;
	await tell(env, {
		kind: "waitlist_offer",
		to: head.email,
		locale: head.locale,
		url: `${env.APP_URL}/works/${copy.work_id}`,
		bookTitle: copy.title,
		ownerName: copy.owner_name,
		hours: HOLD_HOURS,
	}).catch((error: unknown) =>
		console.error("[waitlist] notify failed", error),
	);
}

/**
 * The copy stopped being lendable (paused, retired, its owner away or gone):
 * a hold on it is lifted. The member keeps their place in the queue, since
 * letting it lapse was not theirs to do.
 */
export function releaseHolds(env: Env, copyIds: string | string[]) {
	const ids = Array.isArray(copyIds) ? copyIds : [copyIds];
	return env.DB.prepare(
		`UPDATE waitlist SET offered_copy_id = NULL, offer_expires_at = NULL
		  WHERE offered_copy_id IN (SELECT value FROM json_each(?))`,
	).bind(JSON.stringify(ids));
}

/**
 * Daily: free copies of waited-for works that nobody is held for get offered.
 * Catches what no event announces, like an owner's time away running out.
 */
export async function offerWaitedFor(env: Env): Promise<number> {
	const { results } = await env.DB.prepare(
		`SELECT c.id FROM copies c JOIN editions e ON e.id = c.edition_id
		  WHERE c.state = 'shelved' AND c.lending = 'lendable' AND c.quantity = 1
		    AND EXISTS (SELECT 1 FROM waitlist w WHERE w.work_id = e.work_id
		                  AND (w.offered_copy_id IS NULL OR w.offer_expires_at < ?1))
		    AND NOT EXISTS (SELECT 1 FROM waitlist h
		                     WHERE h.offered_copy_id = c.id AND h.offer_expires_at > ?1)
		  LIMIT 50`,
	)
		.bind(now())
		.all<{ id: string }>();
	// One copy's failure, a D1 error say, must not keep the rest from being offered.
	for (const row of results)
		await onCopyAvailable(env, row.id).catch((error: unknown) =>
			console.error("[waitlist] offer failed", row.id, error),
		);
	return results.length;
}

/** First in the queue for the copy's work, not already holding a copy. */
function queueHead(
	env: Env,
	copy: { work_id: string; community_id: string | null; owner_id: string },
	skip: string | null,
) {
	return env.DB.prepare(
		`SELECT w.id, w.member_id, m.email, m.locale FROM waitlist w JOIN members m ON m.id = w.member_id
		   JOIN memberships ms ON ms.member_id = w.member_id AND ms.community_id = w.community_id
		                      AND ms.status = 'active'
		  WHERE w.work_id = ? AND w.community_id = ? AND w.member_id != ?
		    AND w.member_id != coalesce(?, '')
		    AND (w.offered_copy_id IS NULL OR w.offer_expires_at < ?)
		  ORDER BY w.created_at ASC LIMIT 1`,
	)
		.bind(copy.work_id, copy.community_id, copy.owner_id, skip, now())
		.first<{
			id: string;
			member_id: string;
			email: string;
			locale: "en" | "he";
		}>();
}

/** Who, if anyone, has first dibs on this copy right now. */
export async function holdOn(env: Env, copyId: string) {
	return env.DB.prepare(
		"SELECT member_id, offer_expires_at FROM waitlist WHERE offered_copy_id = ? AND offer_expires_at > ?",
	)
		.bind(copyId, now())
		.first<{ member_id: string; offer_expires_at: number }>();
}

/** Daily: expired holds pass to the next in line. */
export async function expireHolds(env: Env): Promise<number> {
	const { results } = await env.DB.prepare(
		`SELECT id, member_id, offered_copy_id, offer_expires_at FROM waitlist
		  WHERE offer_expires_at IS NOT NULL AND offer_expires_at < ?`,
	)
		.bind(now())
		.all<{
			id: string;
			member_id: string;
			offered_copy_id: string;
			offer_expires_at: number;
		}>();
	let passed = 0;
	for (const row of results) {
		// The member who let the hold lapse goes to the back of the queue. Only
		// if it is still the hold that lapsed: an earlier pass in this loop may
		// have just offered them another copy.
		const lapsed = await env.DB.prepare(
			`UPDATE waitlist SET offered_copy_id = NULL, offer_expires_at = NULL, created_at = ?
			  WHERE id = ? AND offered_copy_id = ? AND offer_expires_at = ?`,
		)
			.bind(now(), row.id, row.offered_copy_id, row.offer_expires_at)
			.run();
		if (!lapsed.meta.changes) continue;
		passed += 1;
		// The hold is already lapsed; a copy that cannot be passed on must not
		// hold up the other lapsed holds.
		await onCopyAvailable(env, row.offered_copy_id, row.member_id).catch(
			(error: unknown) =>
				console.error("[waitlist] pass-on failed", row.offered_copy_id, error),
		);
	}
	return passed;
}

export async function joinWaitlist(
	env: Env,
	memberId: string,
	communityId: string,
	workId: string,
) {
	const id = ulid();
	// Asking for a book here makes it one of this community's books.
	await env.DB.batch([
		env.DB.prepare(
			`INSERT OR IGNORE INTO waitlist (id, work_id, community_id, member_id, created_at) VALUES (?, ?, ?, ?, ?)`,
		).bind(id, workId, communityId, memberId, now()),
		linkWork(env, workId, communityId),
	]);
	return position(env, memberId, communityId, workId);
}

export async function position(
	env: Env,
	memberId: string,
	communityId: string,
	workId: string,
) {
	const row = await env.DB.prepare(
		`SELECT w.id, (SELECT count(*) FROM waitlist o WHERE o.work_id = w.work_id AND o.community_id = w.community_id
		                 AND o.created_at <= w.created_at) AS position
		   FROM waitlist w WHERE w.member_id = ? AND w.community_id = ? AND w.work_id = ?`,
	)
		.bind(memberId, communityId, workId)
		.first<{ id: string; position: number }>();
	return row ?? null;
}

/** How often one member hears about the same book on their wishlist. */
const WISHLIST_QUIET_DAYS = 7;

/**
 * A copy is free and held for nobody: tell the members who want the book.
 * Only in the copy's community, never its owner, and not again for the same
 * book within the week, so a book passed around does not ring every time.
 */
async function tellWishers(
	env: Env,
	copy: {
		owner_id: string;
		work_id: string;
		title: string;
		owner_name: string;
		community_id: string | null;
	},
): Promise<void> {
	const { results } = await env.DB.prepare(
		`SELECT wl.member_id, m.email, m.locale FROM wishlist wl
		   JOIN members m ON m.id = wl.member_id
		   JOIN memberships ms ON ms.member_id = m.id AND ms.community_id = ? AND ms.status = 'active'
		  WHERE wl.work_id = ? AND wl.member_id != ? AND m.deactivated_at IS NULL
		    AND (wl.notified_at IS NULL OR wl.notified_at < ?)
		  LIMIT 50`,
	)
		.bind(
			copy.community_id,
			copy.work_id,
			copy.owner_id,
			now() - WISHLIST_QUIET_DAYS * 86400,
		)
		.all<{ member_id: string; email: string; locale: "en" | "he" }>();
	if (!results.length) return;
	// Stamped only if still quiet, and told only if stamped here: two passes
	// at once must not tell the same reader twice.
	const stamped = await env.DB.batch(
		results.map((row) =>
			env.DB.prepare(
				`UPDATE wishlist SET notified_at = ?1 WHERE member_id = ?2 AND work_id = ?3
				  AND (notified_at IS NULL OR notified_at < ?4)`,
			).bind(
				now(),
				row.member_id,
				copy.work_id,
				now() - WISHLIST_QUIET_DAYS * 86400,
			),
		),
	);
	const fresh = results.filter((_, index) => stamped[index]?.meta.changes);
	await Promise.all(
		fresh.map((row) =>
			tell(env, {
				kind: "wishlist_available",
				to: row.email,
				locale: row.locale,
				url: `${env.APP_URL}/works/${copy.work_id}`,
				bookTitle: copy.title,
				ownerName: copy.owner_name,
			}).catch((error: unknown) =>
				console.error("[wishlist] notify failed", error),
			),
		),
	);
}
