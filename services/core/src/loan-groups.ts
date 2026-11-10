import type { Env } from "./env.ts";

/**
 * Loans that travel together: the same borrower, the same person they meet,
 * the same stage. On the way out that person is whoever holds each copy
 * (the reader before on a relay, else the owner) and the loans are accepted;
 * on the way back it is the owner and the loans are active. One meeting
 * hands them all over, so one handoff is arranged for them all.
 *
 * The loan asked about comes first; the rest follow in the order they were
 * asked for. Empty when the loan is not at a handoff stage.
 */
export async function together(
	env: Env,
	loanId: string,
	direction: "out" | "back",
): Promise<{ id: string; title: string }[]> {
	const giver =
		direction === "out" ? "coalesce(#.relay_from, #.lender_id)" : "#.lender_id";
	const { results } = await env.DB.prepare(
		`SELECT s.id, e.title
		   FROM loans l
		   JOIN loans s ON s.borrower_id = l.borrower_id
		                AND ${giver.replaceAll("#", "s")} = ${giver.replaceAll("#", "l")}
		                AND s.status = l.status
		   JOIN copies c ON c.id = s.copy_id
		   JOIN editions e ON e.id = c.edition_id
		  WHERE l.id = ?1 AND l.status = ?2
		  ORDER BY s.id = l.id DESC, s.requested_at, s.id`,
	)
		.bind(loanId, direction === "out" ? "accepted" : "active")
		.all<{ id: string; title: string }>();
	return results;
}

/** Several titles as one line for an email's subject and body. */
export function titles(names: string[]): string {
	return names.join(", ");
}

/**
 * A loan accepted while others between the same two people already have a
 * time on the table joins that time: the same day, the same answer so far,
 * and once agreed the same code. Runs in the batch that accepts it, after
 * the stale handoffs are dropped.
 */
export function joinGroupHandoff(env: Env, loanId: string, handoffId: string) {
	return env.DB.prepare(
		`INSERT INTO handoffs (id, loan_id, direction, day, period, proposed_by, status, code, created_at, agreed_at)
		 SELECT ?1, me.id, 'out', h.day, h.period, h.proposed_by, h.status, h.code, unixepoch(), h.agreed_at
		   FROM loans me
		   JOIN loans s ON s.borrower_id = me.borrower_id
		               AND coalesce(s.relay_from, s.lender_id) = coalesce(me.relay_from, me.lender_id)
		               AND s.status = 'accepted' AND s.id != me.id
		   JOIN handoffs h ON h.loan_id = s.id AND h.direction = 'out'
		                  AND h.status IN ('proposed', 'agreed')
		  WHERE me.id = ?2 AND me.status = 'accepted'
		    AND NOT EXISTS (SELECT 1 FROM handoffs x WHERE x.loan_id = me.id
		                      AND x.direction = 'out' AND x.status IN ('proposed', 'agreed'))
		  ORDER BY h.status = 'agreed' DESC, h.created_at DESC
		  LIMIT 1`,
	).bind(handoffId, loanId);
}
