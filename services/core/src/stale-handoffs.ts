import type { Env } from "./env.ts";

/**
 * Cancels the open handoffs on a copy's loans that no longer wait for one:
 * the way out needs an accepted loan, the way back an active one. Goes last
 * in every batch that moves a loan on (cancel, decline, handed, returned,
 * lost, relayed), so no handoff outlives the stage it was arranged for.
 */
export function dropStaleHandoffs(env: Env, copyId: string) {
	return env.DB.prepare(
		`UPDATE handoffs SET status = 'cancelled'
		  WHERE status IN ('proposed', 'agreed')
		    AND loan_id IN (SELECT id FROM loans WHERE copy_id = ?1)
		    AND NOT EXISTS (
		      SELECT 1 FROM loans l
		       WHERE l.id = handoffs.loan_id
		         AND ((handoffs.direction = 'out' AND l.status = 'accepted')
		           OR (handoffs.direction = 'back' AND l.status = 'active')))`,
	).bind(copyId);
}
