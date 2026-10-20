import type { Env } from "./env.ts";
import { tell } from "./notify.ts";
import { pruneRateLimits } from "./rate-limit.ts";
import { expireHolds, offerWaitedFor } from "./waitlist.ts";
import { now } from "./ids.ts";

/**
 * The daily pass. Each reminder goes out once per stage, recorded on the loan.
 * Numbers follow decision 0007: nudge before and after the due date, moderator
 * at 14 days overdue, no fines, no automatic blocking.
 */
export const UNANSWERED_AFTER_DAYS = 2;
export const DUE_SOON_DAYS = 3;
export const OVERDUE_AFTER_DAYS = 1;
export const ESCALATE_AFTER_DAYS = 14;

const DAY = 86_400;
interface LoanRow {
	id: string;
	status: string;
	requested_at: number;
	due_at: number | null;
	title: string;
	borrower_email: string;
	borrower_locale: "en" | "he";
	borrower_name: string;
	lender_email: string;
	lender_locale: "en" | "he";
	lender_name: string;
	community_id: string;
}

/**
 * Sign-in links a day past expiry (each keeps an address, joined or not),
 * sessions a month after they ended, a connection's plain token once its
 * code is used or lapsed, and email follow-ups a day old that no pass sent.
 */
export function forgetSpent(env: Env, at: number) {
	return env.DB.batch([
		env.DB.prepare("DELETE FROM magic_links WHERE expires_at < ?").bind(
			at - DAY,
		),
		// A browser whose sign-in ended hears nothing more.
		env.DB.prepare(
			`DELETE FROM push_subscriptions WHERE session_id IN (
			   SELECT id FROM sessions WHERE coalesce(revoked_at, expires_at) < ?)`,
		).bind(at),
		env.DB.prepare(
			"DELETE FROM sessions WHERE coalesce(revoked_at, expires_at) < ?",
		).bind(at - 30 * DAY),
		env.DB.prepare(
			`UPDATE consent_codes SET token_plain = NULL
			  WHERE token_plain IS NOT NULL AND (used_at IS NOT NULL OR expires_at <= ?)`,
		).bind(at),
		env.DB.prepare("DELETE FROM pending_emails WHERE created_at < ?").bind(
			at - DAY,
		),
	]);
}

/**
 * Mark a stage done before telling anyone, and tell only if this pass is the
 * one that marked it: two passes at once (a cron delivered twice, or late
 * and on time) send each reminder once.
 */
async function claim(
	env: Env,
	stage:
		| "reminded_unanswered_at"
		| "reminded_due_at"
		| "reminded_overdue_at"
		| "escalated_at",
	loanId: string,
	at: number,
): Promise<boolean> {
	const claimed = await env.DB.prepare(
		`UPDATE loans SET ${stage} = ? WHERE id = ? AND ${stage} IS NULL`,
	)
		.bind(at, loanId)
		.run();
	return claimed.meta.changes > 0;
}

export async function runReminders(
	env: Env,
): Promise<{ sent: number; escalated: number }> {
	const at = now();
	let sent = 0;
	let escalated = 0;

	// Housekeeping: spent rate-limit windows are of no further use, and
	// what only remembers people once it is spent is forgotten.
	await pruneRateLimits(env).catch(() => 0);
	await forgetSpent(env, at).catch((error: unknown) =>
		console.error("[housekeeping] forget failed", error),
	);

	const base = `SELECT l.id, l.status, l.requested_at, l.due_at, l.community_id, e.title,
	                     b.email AS borrower_email, b.locale AS borrower_locale, b.display_name AS borrower_name,
	                     o.email AS lender_email, o.locale AS lender_locale, o.display_name AS lender_name
	                FROM loans l
	                JOIN copies c ON c.id = l.copy_id
	                JOIN editions e ON e.id = c.edition_id
	                JOIN members b ON b.id = l.borrower_id
	                JOIN members o ON o.id = l.lender_id`;

	// 1. Requests nobody answered: remind the lender.
	const unanswered = await env.DB.prepare(
		`${base} WHERE l.status = 'requested' AND l.requested_at < ? AND l.reminded_unanswered_at IS NULL`,
	)
		.bind(at - UNANSWERED_AFTER_DAYS * DAY)
		.all<LoanRow>();
	for (const loan of unanswered.results) {
		if (!(await claim(env, "reminded_unanswered_at", loan.id, at))) continue;
		await tell(env, {
			kind: "loan_reminder",
			to: loan.lender_email,
			locale: loan.lender_locale,
			url: `${env.APP_URL}/loans/${loan.id}`,
			bookTitle: loan.title,
			otherName: loan.borrower_name,
			stage: "unanswered",
			days: Math.floor((at - loan.requested_at) / DAY),
		}).catch(() => undefined);
		sent += 1;
	}

	// 2. Due soon: remind the borrower.
	const dueSoon = await env.DB.prepare(
		`${base} WHERE l.status = 'active' AND l.due_at BETWEEN ? AND ? AND l.reminded_due_at IS NULL`,
	)
		.bind(at, at + DUE_SOON_DAYS * DAY)
		.all<LoanRow>();
	for (const loan of dueSoon.results) {
		if (!(await claim(env, "reminded_due_at", loan.id, at))) continue;
		await tell(env, {
			kind: "loan_reminder",
			to: loan.borrower_email,
			locale: loan.borrower_locale,
			url: `${env.APP_URL}/loans/${loan.id}`,
			bookTitle: loan.title,
			otherName: loan.lender_name,
			stage: "due_soon",
			days: Math.max(0, Math.ceil((loan.due_at! - at) / DAY)),
		}).catch(() => undefined);
		sent += 1;
	}

	// 3. Overdue: remind the borrower once.
	const overdue = await env.DB.prepare(
		`${base} WHERE l.status = 'active' AND l.due_at < ? AND l.reminded_overdue_at IS NULL`,
	)
		.bind(at - OVERDUE_AFTER_DAYS * DAY)
		.all<LoanRow>();
	for (const loan of overdue.results) {
		if (!(await claim(env, "reminded_overdue_at", loan.id, at))) continue;
		await tell(env, {
			kind: "loan_reminder",
			to: loan.borrower_email,
			locale: loan.borrower_locale,
			url: `${env.APP_URL}/loans/${loan.id}`,
			bookTitle: loan.title,
			otherName: loan.lender_name,
			stage: "overdue",
			days: Math.floor((at - loan.due_at!) / DAY),
		}).catch(() => undefined);
		sent += 1;
	}

	// 4. Long overdue: hand to the moderators, once per loan.
	const stale = await env.DB.prepare(
		`${base} WHERE l.status = 'active' AND l.due_at < ? AND l.escalated_at IS NULL`,
	)
		.bind(at - ESCALATE_AFTER_DAYS * DAY)
		.all<LoanRow>();
	const byCommunity = new Map<string, LoanRow[]>();
	for (const loan of stale.results) {
		if (!(await claim(env, "escalated_at", loan.id, at))) continue;
		byCommunity.set(loan.community_id, [
			...(byCommunity.get(loan.community_id) ?? []),
			loan,
		]);
		escalated += 1;
	}
	for (const [communityId, loans] of byCommunity) {
		const moderators = await env.DB.prepare(
			`SELECT m.email, m.locale FROM memberships ms JOIN members m ON m.id = ms.member_id
			  WHERE ms.community_id = ? AND ms.role IN ('moderator', 'admin') AND ms.status = 'active'`,
		)
			.bind(communityId)
			.all<{ email: string; locale: "en" | "he" }>();
		for (const moderator of moderators.results) {
			await tell(env, {
				kind: "librarian_digest",
				to: moderator.email,
				locale: moderator.locale,
				url: `${env.APP_URL}/admin`,
				items: loans.map((loan) => ({
					bookTitle: loan.title,
					borrowerName: loan.borrower_name,
					lenderName: loan.lender_name,
					daysOverdue: Math.floor((at - loan.due_at!) / DAY),
				})),
			}).catch(() => undefined);
		}
	}

	// Waitlist holds that lapsed pass to the next in line, and copies that
	// came free unannounced (an owner back from away) find their waiters.
	await expireHolds(env).catch((error: unknown) =>
		console.error("[waitlist] expire failed", error),
	);
	await offerWaitedFor(env).catch((error: unknown) =>
		console.error("[waitlist] offers failed", error),
	);

	return { sent, escalated };
}

/** What the overview shows moderators: the same lines the digest draws. */
export async function attention(
	env: Env,
	communityId: string,
	viewerId?: string,
) {
	const at = now();
	const { results } = await env.DB.prepare(
		`SELECT l.id, l.status, l.requested_at, l.due_at, e.title,
		        l.borrower_id, l.lender_id,
		        b.display_name AS borrower_name, o.display_name AS lender_name
		   FROM loans l
		   JOIN copies c ON c.id = l.copy_id
		   JOIN editions e ON e.id = c.edition_id
		   JOIN members b ON b.id = l.borrower_id
		   JOIN members o ON o.id = l.lender_id
		  WHERE l.community_id = ?
		    AND ((l.status = 'active' AND l.due_at < ?) OR (l.status = 'requested' AND l.requested_at < ?))
		    -- A loan with a suspended member is listed as that instead.
		    AND NOT EXISTS (SELECT 1 FROM memberships sm
		              WHERE sm.community_id = l.community_id AND sm.status = 'suspended'
		                AND sm.member_id IN (l.borrower_id, l.lender_id, l.relay_from))
		  ORDER BY l.due_at ASC, l.requested_at ASC LIMIT 100`,
	)
		.bind(
			communityId,
			at - ESCALATE_AFTER_DAYS * DAY,
			at - UNANSWERED_AFTER_DAYS * DAY,
		)
		.all<{
			id: string;
			status: string;
			requested_at: number;
			due_at: number | null;
			title: string;
			borrower_id: string;
			lender_id: string;
			borrower_name: string;
			lender_name: string;
		}>();
	const open = await env.DB.prepare(
		`SELECT r.id, r.kind, r.body, r.created_at, r.loan_id, e.title,
		        p.display_name AS reporter_name, s.display_name AS subject_name
		   FROM reports r
		   JOIN members p ON p.id = r.reporter_id
		   LEFT JOIN members s ON s.id = r.subject_member
		   LEFT JOIN loans l ON l.id = r.loan_id
		   LEFT JOIN copies c ON c.id = l.copy_id
		   LEFT JOIN editions e ON e.id = c.edition_id
		  WHERE r.community_id = ? AND r.status = 'open' ORDER BY r.created_at ASC LIMIT 50`,
	)
		.bind(communityId)
		.all<{
			id: string;
			kind: string;
			body: string | null;
			created_at: number;
			loan_id: string | null;
			title: string | null;
			reporter_name: string;
			subject_name: string | null;
		}>();

	// Every open loan with a suspended member is the moderators' to settle:
	// nobody can message or nudge that member any more.
	const cutOff = await env.DB.prepare(
		`SELECT l.id, l.status, l.requested_at, l.started_at, e.title,
		        l.borrower_id, l.lender_id,
		        b.display_name AS borrower_name, o.display_name AS lender_name,
		        (SELECT group_concat(m.display_name, ', ') FROM memberships sm
		           JOIN members m ON m.id = sm.member_id
		          WHERE sm.community_id = l.community_id AND sm.status = 'suspended'
		            AND sm.member_id IN (l.borrower_id, l.lender_id, l.relay_from)) AS suspended_name
		   FROM loans l
		   JOIN copies c ON c.id = l.copy_id
		   JOIN editions e ON e.id = c.edition_id
		   JOIN members b ON b.id = l.borrower_id
		   JOIN members o ON o.id = l.lender_id
		  WHERE l.community_id = ? AND l.status IN ('requested', 'accepted', 'active')
		    AND EXISTS (SELECT 1 FROM memberships sm
		              WHERE sm.community_id = l.community_id AND sm.status = 'suspended'
		                AND sm.member_id IN (l.borrower_id, l.lender_id, l.relay_from))
		  ORDER BY l.requested_at ASC LIMIT 100`,
	)
		.bind(communityId)
		.all<{
			id: string;
			status: string;
			requested_at: number;
			started_at: number | null;
			title: string;
			borrower_id: string;
			lender_id: string;
			borrower_name: string;
			lender_name: string;
			suspended_name: string;
		}>();

	const suggestions = await env.DB.prepare(
		`SELECT p.id, p.label, p.namespace, p.namespace_label, p.created_at, m.display_name
		   FROM tag_proposals p JOIN members m ON m.id = p.proposed_by
		  WHERE p.community_id = ? AND p.status = 'pending'
		  ORDER BY p.created_at ASC LIMIT 20`,
	)
		.bind(communityId)
		.all<{
			id: string;
			label: string;
			namespace: string | null;
			namespace_label: string | null;
			created_at: number;
			display_name: string;
		}>();

	return [
		...cutOff.results.map((row) => ({
			loanId: row.id,
			kind: "suspended" as const,
			reportId: null,
			reportKind: null,
			body: null,
			bookTitle: row.title,
			borrowerName: row.borrower_name,
			lenderName: row.lender_name,
			// How long the book has been out, or the request has stood.
			days: Math.floor((at - (row.started_at ?? row.requested_at)) / DAY),
			mine: row.borrower_id === viewerId || row.lender_id === viewerId,
			suspendedName: row.suspended_name,
			loanStatus: row.status,
		})),
		...suggestions.results.map((row) => ({
			loanId: null,
			kind: "tag" as const,
			reportId: row.id,
			reportKind: row.namespace ?? row.namespace_label,
			body: row.label,
			bookTitle: "",
			borrowerName: row.display_name,
			lenderName: "",
			days: Math.floor((at - row.created_at) / DAY),
			mine: false,
		})),
		...open.results.map((row) => ({
			loanId: row.loan_id,
			kind: "report" as const,
			reportId: row.id,
			reportKind: row.kind,
			body: row.body,
			bookTitle: row.title ?? "",
			borrowerName: row.reporter_name,
			lenderName: row.subject_name ?? "",
			days: Math.floor((at - row.created_at) / DAY),
			mine: false,
		})),
		...results.map((row) => ({
			loanId: row.id,
			kind:
				row.status === "active"
					? ("overdue" as const)
					: ("unanswered" as const),
			reportId: null,
			reportKind: null,
			body: null,
			bookTitle: row.title,
			borrowerName: row.borrower_name,
			lenderName: row.lender_name,
			days:
				row.status === "active"
					? Math.floor((at - (row.due_at ?? at)) / DAY)
					: Math.floor((at - row.requested_at) / DAY),
			mine: row.borrower_id === viewerId || row.lender_id === viewerId,
		})),
	];
}
