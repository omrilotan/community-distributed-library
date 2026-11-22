import { log } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { tallied } from "./tallies.ts";

/**
 * Whether the library is quietly wrong (docs/observability-plan.md, 1.4):
 * each check is one count that should be 0. They run every 15 minutes from
 * the every-minute cron, and each result is kept in check_results.
 *
 * A failing `critical` check logs an error, which Workers Issues turns into
 * an alert to the library's admins (one Issue per check). `warn` and `info`
 * ones are logged and kept for the weekly digest and the ops tools.
 *
 * When a bug is found that a check could have caught, add the check with the
 * fix. Every query must be index-backed: they run 96 times a day.
 */
export type Severity = "critical" | "warn" | "info";

export interface Check {
	name: string;
	severity: Severity;
	/** Fail only when the previous run failed too: a queue may be busy once. */
	twice?: boolean;
	/** What it means for members, in one line (the runbook says more). */
	means: string;
	count(env: Env, at: number): Promise<number>;
}

const MINUTE = 60;
const DAY = 86_400;

const count = async (
	env: Env,
	sql: string,
	...values: unknown[]
): Promise<number> =>
	(
		await env.DB.prepare(sql)
			.bind(...values)
			.first<{ n: number }>()
	)?.n ?? 0;

export const CHECKS: Check[] = [
	{
		name: "sign_in_mail_failing",
		severity: "critical",
		means: "Members asking to sign in are not getting the email.",
		count: (env) => tallied(env, "sign_in_mail_failed", 1),
	},
	{
		name: "emails_stuck",
		severity: "critical",
		twice: true,
		means: "Follow-up emails are waiting past their time and not going.",
		count: (env, at) =>
			count(
				env,
				"SELECT COUNT(*) AS n FROM pending_emails WHERE send_after < ?",
				at - 15 * MINUTE,
			),
	},
	{
		name: "held_notices_stuck",
		severity: "critical",
		twice: true,
		means: "Owners are not hearing about loan requests.",
		count: (env, at) =>
			count(
				env,
				"SELECT COUNT(*) AS n FROM held_notices WHERE send_at < ?",
				at - 10 * MINUTE,
			),
	},
	{
		name: "backup_missing",
		severity: "critical",
		means: "Last night's database snapshot is not in the backups bucket.",
		count: async (env, at) => {
			// A library that opted out has no bucket and no snapshot to miss.
			if (!env.BACKUPS) return 0;
			// The snapshot runs at 03:20 UTC; before 04:00 yesterday's will do.
			const day = (offset: number) =>
				new Date((at - offset) * 1000).toISOString().slice(0, 10);
			const hour = new Date(at * 1000).getUTCHours();
			const days = hour < 4 ? [day(0), day(DAY)] : [day(0)];
			for (const name of days)
				if (await env.BACKUPS.head(`d1/${name}.sql`)) return 0;
			// A library opened today has had no night yet.
			const opened = await count(
				env,
				"SELECT COALESCE(MIN(created_at), 0) AS n FROM communities",
			);
			return at - opened < DAY ? 0 : 1;
		},
	},
	{
		name: "emails_given_up",
		severity: "warn",
		means: "Some emails were given up after five tries, in the last day.",
		count: (env) => tallied(env, "email_given_up", 24),
	},
	{
		name: "webhooks_failing",
		severity: "warn",
		means: "Webhook deliveries failed for good in the last day.",
		count: (env, at) =>
			count(
				env,
				"SELECT COUNT(*) AS n FROM webhook_deliveries WHERE status = 'failed' AND created_at > ?",
				at - DAY,
			),
	},
	{
		name: "copy_loan_mismatch",
		severity: "warn",
		means:
			"A copy's state disagrees with its loans: on loan with no loan, or shelved while lent.",
		count: (env) =>
			count(
				env,
				`SELECT
				   (SELECT COUNT(*) FROM copies c
				     WHERE c.state = 'on_loan' AND c.quantity = 1
				       AND NOT EXISTS (SELECT 1 FROM loans l
				                        WHERE l.copy_id = c.id AND l.status = 'active'))
				 + (SELECT COUNT(*) FROM loans l JOIN copies c ON c.id = l.copy_id
				     WHERE l.status = 'active' AND l.of_set = 0
				       AND c.quantity = 1 AND c.state = 'shelved') AS n`,
			),
	},
	{
		name: "loan_no_handoff",
		severity: "warn",
		means: "Loans agreed two weeks ago still have no handover proposed.",
		count: (env, at) =>
			count(
				env,
				`SELECT COUNT(*) AS n FROM loans l
				  WHERE l.status = 'accepted' AND l.decided_at < ?
				    AND NOT EXISTS (SELECT 1 FROM handoffs h WHERE h.loan_id = l.id)`,
				at - 14 * DAY,
			),
	},
	{
		name: "tokens_abandoned",
		severity: "warn",
		means: "Assistant connections nobody collected are not being revoked.",
		count: (env, at) =>
			count(
				env,
				`SELECT COUNT(*) AS n FROM consent_codes cc
				   JOIN access_tokens t ON t.id = cc.token_id
				  WHERE cc.used_at IS NULL AND cc.expires_at < ?
				    AND t.revoked_at IS NULL AND t.last_used_at IS NULL`,
				at - 2 * DAY,
			),
	},
	{
		name: "covers_external",
		severity: "warn",
		means: "Covers older than two days still live on another site.",
		count: (env, at) =>
			count(
				env,
				`SELECT COUNT(*) AS n FROM editions
				  WHERE cover_tried_at IS NULL AND cover_url IS NOT NULL
				    AND created_at < ? AND cover_url NOT LIKE ?`,
				at - 2 * DAY,
				`${env.COVERS_PUBLIC_URL.replace(/\/$/, "")}/%`,
			),
	},
	{
		name: "push_gone",
		severity: "info",
		means: "Browsers threw away push subscriptions in the last day.",
		count: (env) => tallied(env, "push_gone", 24),
	},
	{
		name: "threads_past_purge",
		severity: "critical",
		means:
			"Loan conversations are kept past the 90 days members were promised.",
		// Convo keeps the threads; an older convo without the call says nothing.
		count: async (env) =>
			(await env.CONVO.checks().catch(() => null))?.threads_past_purge ?? 0,
	},
];

export interface CheckResult {
	name: string;
	severity: Severity;
	value: number;
	ok: boolean;
	failingSince: number | null;
}

/**
 * Runs every check, keeps each result, and logs it: a failing critical one
 * at error (an alert), the rest at warn or info. A check that cannot run
 * logs an error of its own, so a broken check is not taken for a pass.
 */
export async function runChecks(
	env: Env,
	at = Math.floor(Date.now() / 1000),
	only?: string,
): Promise<CheckResult[]> {
	const { results: before } = await env.DB.prepare(
		"SELECT name, value, failing_since FROM check_results",
	).all<{ name: string; value: number; failing_since: number | null }>();
	const out: CheckResult[] = [];
	for (const check of CHECKS.filter((one) => !only || one.name === only)) {
		let value: number;
		try {
			value = await check.count(env, at);
		} catch (error) {
			log.error("check.broken", { key: check.name, check: check.name }, error);
			continue;
		}
		const last = before.find((row) => row.name === check.name);
		const failing = value > 0 && (!check.twice || (last?.value ?? 0) > 0);
		const failingSince = failing ? (last?.failing_since ?? at) : null;
		out.push({
			name: check.name,
			severity: check.severity,
			value,
			ok: !failing,
			failingSince,
		});
		const fields = { key: check.name, check: check.name, value };
		if (failing && check.severity === "critical")
			log.error("check.failed", { ...fields, means: check.means });
		else if (failing && check.severity === "warn")
			log.warn("check.failed", fields);
		else if (failing) log.info("check.failed", fields);
	}
	if (out.length)
		await env.DB.batch(
			out.map((result) =>
				env.DB.prepare(
					`INSERT INTO check_results (name, value, previous_value, severity, checked_at, failing_since)
					 VALUES (?1, ?2, NULL, ?3, ?4, ?5)
					 ON CONFLICT(name) DO UPDATE SET
					   previous_value = value, value = ?2, severity = ?3,
					   checked_at = ?4, failing_since = ?5`,
				).bind(
					result.name,
					result.value,
					result.severity,
					at,
					result.failingSince,
				),
			),
		);
	return out;
}
