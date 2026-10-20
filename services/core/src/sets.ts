import type { Env } from "./env.ts";

/**
 * Sets lent in part (decision 0031). A set's copy never changes hands as a
 * whole: it stays on its owner's shelf while parts of it are out, so the
 * statements that move a copy along with a loan leave sets alone
 * (`AND quantity = 1`), and those that close "the other loan" on a copy
 * (relays) skip loans of sets (`AND of_set = 0`).
 */

/**
 * SQL: the state a whole copy goes back to with its owner. Reserved when the
 * next reader's relay was already agreed (it waits for them, as an ordinary
 * accepted loan now), otherwise on the shelf.
 */
export const BACK_WITH_OWNER = `CASE WHEN EXISTS (SELECT 1 FROM loans nl
	WHERE nl.copy_id = copies.id AND nl.status = 'accepted' AND nl.of_set = 0)
	THEN 'reserved' ELSE 'shelved' END`;

/**
 * SQL: how many of the owner of copy `c`'s items are promised or out, for
 * their lend limit. Items, not loans: a relay agreed on an item already out
 * is still one item, and so is a set lent in parts.
 */
export const OWNER_OUT = `(SELECT count(DISTINCT l.copy_id) FROM loans l
	WHERE l.lender_id = c.owner_id AND l.status IN ('accepted', 'active'))`;

/** SQL: how many of copy `c` are asked for, promised or out right now. */
export const CLAIMED = `(SELECT coalesce(sum(cl.quantity), 0) FROM loans cl
	WHERE cl.copy_id = c.id AND cl.status IN ('requested', 'accepted', 'active'))`;

/**
 * A loan's book or things are lost. A whole item is marked lost; part of a
 * set comes off its count, and only the last of it marks the set lost.
 * Only when the loan was just closed as lost by `mark` (a loss report's id,
 * or a moderator's closing), in the same batch: the same loss told twice
 * comes off once.
 */
export function markLost(
	env: Env,
	copyId: string,
	quantity: number,
	loanId: string,
	mark: string,
) {
	return env.DB.prepare(
		`UPDATE copies
		    SET state = CASE WHEN quantity <= ?1 THEN 'lost' ELSE state END,
		        quantity = CASE WHEN quantity <= ?1 THEN quantity ELSE quantity - ?1 END
		  WHERE id = ?2 AND EXISTS (SELECT 1 FROM loans WHERE id = ?3 AND lost_mark = ?4)`,
	).bind(quantity, copyId, loanId, mark);
}

/**
 * What was reported lost turned up. A whole item goes back on the shelf; part
 * of a set goes back on its count, and a set that was all lost comes back as
 * just what turned up. Only what this `mark` took off, and only once: the
 * loan forgets the mark in the same batch.
 */
export function markFound(
	env: Env,
	copyId: string,
	quantity: number,
	loanId: string,
	mark: string,
) {
	return [
		env.DB.prepare(
			`UPDATE copies
			    SET quantity = CASE WHEN state = 'lost' THEN ?1 ELSE quantity + ?1 END,
			        state = CASE WHEN state = 'lost' THEN 'shelved' ELSE state END,
			        holder_id = CASE WHEN state = 'lost' THEN owner_id ELSE holder_id END
			  WHERE id = ?2 AND EXISTS (SELECT 1 FROM loans WHERE id = ?3 AND lost_mark = ?4)`,
		).bind(quantity, copyId, loanId, mark),
		env.DB.prepare(
			"UPDATE loans SET lost_mark = NULL WHERE id = ? AND lost_mark = ?",
		).bind(loanId, mark),
	];
}
