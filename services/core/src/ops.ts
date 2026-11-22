import { runJob } from "@cdl/contracts";
import { backup } from "./backup.ts";
import { runChecks } from "./checks.ts";
import type { Env } from "./env.ts";
import { health } from "./health.ts";
import { allJobs } from "./jobs.ts";

/**
 * What the ops MCP (services/ops) asks of a library, over the `Internal`
 * entrypoint only: never reachable from the public API. Counts, ids and
 * statuses; never a member's name, address or words. The one exception is
 * `admins`, the addresses the weekly digest goes to.
 */

const one = async (env: Env, sql: string, ...values: unknown[]) =>
	(
		await env.DB.prepare(sql)
			.bind(...values)
			.first<{ n: number }>()
	)?.n ?? 0;

/** The library now: its parts, checks, jobs and delivery queues. */
export async function status(env: Env) {
	const at = Math.floor(Date.now() / 1000);
	const [parts, checks, jobs] = await Promise.all([
		health(env),
		env.DB.prepare(
			"SELECT name, value, previous_value, severity, checked_at, failing_since FROM check_results ORDER BY name",
		).all<{
			name: string;
			value: number;
			previous_value: number | null;
			severity: string;
			checked_at: number;
			failing_since: number | null;
		}>(),
		allJobs(env),
	]);
	return {
		library: env.LIBRARY ?? "local",
		deployedAt: Number(env.DEPLOYED_AT || 0) || null,
		ok: parts.ok,
		parts: parts.parts,
		late: parts.late,
		checks: checks.results,
		jobs,
		queues: {
			emailsWaiting: await one(env, "SELECT COUNT(*) AS n FROM pending_emails"),
			emailsOverdue: await one(
				env,
				"SELECT COUNT(*) AS n FROM pending_emails WHERE send_after < ?",
				at - 15 * 60,
			),
			noticesHeld: await one(env, "SELECT COUNT(*) AS n FROM held_notices"),
			noticesOverdue: await one(
				env,
				"SELECT COUNT(*) AS n FROM held_notices WHERE send_at < ?",
				at - 10 * 60,
			),
			webhooksPending: await one(
				env,
				"SELECT COUNT(*) AS n FROM webhook_deliveries WHERE status = 'pending'",
			),
			webhooksFailed24h: await one(
				env,
				"SELECT COUNT(*) AS n FROM webhook_deliveries WHERE status = 'failed' AND created_at > ?",
				at - 86_400,
			),
		},
	};
}

/** A job's recent runs, newest first. */
export async function jobRuns(env: Env, job: string | null, days: number) {
	const since = Math.floor(Date.now() / 1000) - days * 86_400;
	const { results } = await env.DB.prepare(
		`SELECT job, started_at, finished_at, outcome, detail FROM job_runs
		  WHERE started_at > ? AND (? IS NULL OR job = ?)
		  ORDER BY started_at DESC LIMIT 200`,
	)
		.bind(since, job, job)
		.all();
	return results;
}

/**
 * One loan's way from request to the owner's notice, push and email: ids,
 * kinds, times and statuses only.
 */
export async function deliveryTrace(env: Env, loanId: string) {
	const loan = await env.DB.prepare(
		`SELECT id, status, requested_at, decided_at, started_at, due_at, closed_at
		   FROM loans WHERE id = ?`,
	)
		.bind(loanId)
		.first();
	if (!loan) return null;
	const [events, held, deliveries] = await Promise.all([
		env.DB.prepare(
			`SELECT id, kind, created_at FROM events
			  WHERE json_extract(data, '$.loanId') = ? ORDER BY created_at`,
		)
			.bind(loanId)
			.all(),
		env.DB.prepare("SELECT id, send_at FROM held_notices WHERE loan_id = ?")
			.bind(loanId)
			.all(),
		env.DB.prepare(
			`SELECT d.event_id, d.status, d.attempts, d.last_status, d.next_at
			   FROM webhook_deliveries d JOIN events e ON e.id = d.event_id
			  WHERE json_extract(e.data, '$.loanId') = ?`,
		)
			.bind(loanId)
			.all(),
	]);
	return {
		loan,
		events: events.results,
		// A held notice still here has not gone yet; one gone left no row.
		heldNotices: held.results,
		webhookDeliveries: deliveries.results,
	};
}

/** The addresses of the library's admins, for the weekly digest only. */
export async function admins(env: Env): Promise<string[]> {
	const { results } = await env.DB.prepare(
		`SELECT m.email FROM members m JOIN memberships ms ON ms.member_id = m.id
		  WHERE ms.role = 'admin' AND ms.status = 'active' AND m.deactivated_at IS NULL`,
	).all<{ email: string }>();
	return results.map((row) => row.email);
}

/** Runs one check now (or all), and keeps its result. */
export function runCheck(env: Env, name?: string) {
	return runChecks(env, Math.floor(Date.now() / 1000), name);
}

/** Takes a snapshot now, recorded as the backup job is. */
export async function takeBackup(env: Env) {
	return runJob(
		env.DB,
		"backup",
		async () => (await backup(env)) ?? { skipped: true },
	);
}
