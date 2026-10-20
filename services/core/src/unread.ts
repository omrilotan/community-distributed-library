import type { Env } from "./env.ts";
import { now } from "./ids.ts";

/** Loans a member still hears about: open ones, and those closed in 90 days. */
const RECENT_SECONDS = 90 * 86_400;

/**
 * What a member has not seen on each of their loans: messages from the other
 * side, and on their own reports, the moderators' replies and decision. A
 * loan never opened counts from its start; opening it (reading the thread)
 * sets the mark.
 */
export async function unreadByLoan(
	env: Env,
	memberId: string,
): Promise<Record<string, number>> {
	const { results } = await env.DB.prepare(
		`SELECT l.id, coalesce(lr.read_at, 0) AS since
		   FROM loans l
		   LEFT JOIN loan_reads lr ON lr.loan_id = l.id AND lr.member_id = ?1
		  WHERE (l.borrower_id = ?1 OR l.lender_id = ?1
		         OR (l.relay_from = ?1 AND l.status IN ('requested', 'accepted')))
		    AND (l.status IN ('requested', 'accepted', 'active') OR l.closed_at > ?2
		         OR l.decided_at > ?2)`,
	)
		.bind(memberId, now() - RECENT_SECONDS)
		.all<{ id: string; since: number }>();
	if (results.length === 0) return {};

	const [messages, reports] = await Promise.all([
		env.CONVO.unread(
			memberId,
			results.map((row) => ({ loanId: row.id, since: row.since })),
		),
		env.DB.prepare(
			`SELECT r.loan_id,
			        (SELECT count(*) FROM report_replies rr
			          WHERE rr.report_id = r.id AND rr.from_moderators = 1
			            AND rr.created_at > coalesce(lr.read_at, 0))
			        + (CASE WHEN r.closed_at > coalesce(lr.read_at, 0) THEN 1 ELSE 0 END) AS n
			   FROM reports r
			   LEFT JOIN loan_reads lr ON lr.loan_id = r.loan_id AND lr.member_id = r.reporter_id
			  WHERE r.reporter_id = ? AND r.loan_id IS NOT NULL`,
		)
			.bind(memberId)
			.all<{ loan_id: string; n: number }>(),
	]);

	const counts: Record<string, number> = {};
	const loans = new Set(results.map((row) => row.id));
	for (const [loanId, n] of Object.entries(messages)) {
		if (n) counts[loanId] = n;
	}
	for (const row of reports.results) {
		if (row.n && loans.has(row.loan_id))
			counts[row.loan_id] = (counts[row.loan_id] ?? 0) + row.n;
	}
	return counts;
}

/** The member has the loan's conversation in front of them. */
export async function markRead(
	env: Env,
	memberId: string,
	loanId: string,
): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO loan_reads (member_id, loan_id, read_at) VALUES (?, ?, ?)
		 ON CONFLICT (member_id, loan_id) DO UPDATE SET read_at = excluded.read_at`,
	)
		.bind(memberId, loanId, now())
		.run();
}
