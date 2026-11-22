import { core, libraries, type Env, type Library } from "./env.ts";

/**
 * The ops MCP's tools (docs/observability-plan.md, layer 4): each answers one
 * kind of question about the libraries, in their own terms. Reads only,
 * except run_check and take_backup, which are safe, idempotent, and run only
 * once the operator has said yes.
 */

export interface Tool {
	name: string;
	description: string;
	inputSchema: {
		type: "object";
		properties: Record<string, unknown>;
		required?: string[];
	};
	run(env: Env, args: Record<string, unknown>): Promise<unknown>;
}

const DATASET = 'events.analyticsEngine."cdl_events"';
const slug = {
	type: "string",
	description: "The library's slug, as the manifest names it",
};
const confirm = {
	type: "boolean",
	description:
		"true only after the operator has agreed. Without it, the tool says what it would do.",
};

function find(env: Env, name: unknown): Library {
	const lib = libraries(env).find((one) => one.slug === name);
	if (!lib)
		throw new Error(
			`No library "${String(name)}". Known: ${libraries(env)
				.map((one) => one.slug)
				.join(", ")}`,
		);
	return lib;
}

/** A library's state, or why it did not answer. */
async function state(env: Env, lib: Library) {
	try {
		return await core(env, lib).opsStatus();
	} catch (error) {
		return {
			library: lib.slug,
			ok: false,
			unreachable: error instanceof Error ? error.message : String(error),
		};
	}
}

async function sql<T = Record<string, unknown>>(
	env: Env,
	query: string,
	params: Record<string, string | number> = {},
): Promise<T[]> {
	if (!env.ANALYTICS_SQL)
		throw new Error("No Analytics SQL binding: counts are not available here.");
	const result = await env.ANALYTICS_SQL.query<T & Record<string, unknown>>({
		query,
		params,
	});
	return result.data;
}

const days = (value: unknown, fallback: number, most: number) =>
	Math.min(Math.max(Number(value) || fallback, 1), most);

/** Which runbook an alert or a failing check is for (docs/runbooks/). */
export function runbookFor(text: string): string {
	const rules: [RegExp, string][] = [
		[/sign_in_mail/, "sign-in-mail-failing"],
		[/emails_stuck/, "emails-stuck"],
		[/held_notices/, "held-notices-stuck"],
		[/backup_missing/, "backup-missing"],
		[/threads_past_purge/, "threads-past-purge"],
		[/copy_loan_mismatch|loan_no_handoff/, "data-drift"],
		[/emails_given_up|webhooks_failing|push_gone/, "delivery-degraded"],
		[/job\.(missed|failed)|tokens_abandoned|covers_external/, "job-missed"],
		[/certificate|ssl/i, "certificate"],
	];
	const page = rules.find(([pattern]) => pattern.test(text))?.[1];
	return `docs/runbooks/${page ?? "new-failure"}.md`;
}

/** The fix prompt of docs/runbooks/README.md, filled from the evidence. */
export function fixPrompt(fields: {
	alert: string;
	slug: string;
	time: string;
	evidence: string;
	runbook: string;
}): string {
	return [
		`Alert ${fields.alert} fired for library ${fields.slug} at ${fields.time}.`,
		`Evidence: ${fields.evidence}.`,
		`Runbook: ${fields.runbook} (read its "Fix prompt notes" and add them after step 1).`,
		"",
		"1. Reproduce from the evidence before changing anything. Pull the library's database with",
		`   \`npm run db:pull -- core --library ${fields.slug}\` if the data matters, and write a failing test`,
		"   (vitest in workerd, against the migrated D1) that shows the fault.",
		"2. Fix at the narrowest layer. Do not widen scope.",
		"3. If the fault was a silent wrong outcome, add or tighten a check in services/core/src/checks.ts",
		"   so it is caught next time.",
		"4. Run npm run typecheck, npm test and npm run format.",
		"5. Open a draft PR that names the evidence. Do not deploy.",
		"If the evidence does not point to a cause, stop and say so. Do not guess a fix.",
	].join("\n");
}

export const TOOLS: Tool[] = [
	{
		name: "fleet_status",
		description:
			"Every library at a glance: whether it works, failing parts, late jobs, failing checks, overdue queues and this week's alerts. Start here for 'is anything wrong?'.",
		inputSchema: { type: "object", properties: {} },
		async run(env) {
			const week = Math.floor(Date.now() / 1000) - 7 * 86_400;
			const { results: alerts } = await env.DB.prepare(
				"SELECT library, COUNT(*) AS n FROM alerts WHERE received_at > ? GROUP BY library",
			)
				.bind(week)
				.all<{ library: string | null; n: number }>();
			return Promise.all(
				libraries(env).map(async (lib) => {
					const now = await state(env, lib);
					if (!("checks" in now)) return now;
					return {
						library: lib.slug,
						host: lib.host,
						ok: now.ok,
						failingParts: Object.entries(now.parts)
							.filter(([, part]) => part !== "ok")
							.map(([part]) => part),
						lateJobs: now.late,
						failingChecks: now.checks
							.filter((check) => check.failing_since !== null)
							.map((check) => ({
								check: check.name,
								value: check.value,
								severity: check.severity,
								since: check.failing_since,
							})),
						overdue: {
							emails: now.queues.emailsOverdue,
							notices: now.queues.noticesOverdue,
						},
						alertsThisWeek:
							alerts.find((row) => row.library === lib.slug)?.n ?? 0,
					};
				}),
			);
		},
	},
	{
		name: "library_health",
		description:
			"One library in depth: its parts, every check and job, its delivery queues, and its last day of requests (counts by outcome, slowest routes).",
		inputSchema: {
			type: "object",
			properties: { slug },
			required: ["slug"],
		},
		async run(env, args) {
			const lib = find(env, args.slug);
			const now = await state(env, lib);
			const traffic = await sql(
				env,
				`SELECT blob3 AS outcome, SUM(double4) AS requests
				   FROM ${DATASET}
				  WHERE index1 = $slug AND blob1 = 'request'
				    AND timestamp > NOW() - INTERVAL '1' DAY
				  GROUP BY outcome`,
				{ slug: lib.slug },
			).catch((error: Error) => ({ unavailable: error.message }));
			const slowest = await sql(
				env,
				`SELECT blob2 AS route, SUM(double2 * double4) / SUM(double4) AS avg_ms, MAX(double2) AS max_ms
				   FROM ${DATASET}
				  WHERE index1 = $slug AND blob1 = 'request'
				    AND timestamp > NOW() - INTERVAL '1' DAY
				  GROUP BY route ORDER BY avg_ms DESC LIMIT 5`,
				{ slug: lib.slug },
			).catch((error: Error) => ({ unavailable: error.message }));
			return { ...now, lastDay: { traffic, slowest } };
		},
	},
	{
		name: "list_alerts",
		description:
			"The alerts Cloudflare sent (failing Workers, certificates), newest first.",
		inputSchema: {
			type: "object",
			properties: {
				days: { type: "number", description: "How far back; default 7" },
				slug: { ...slug, description: "Only this library's" },
			},
		},
		async run(env, args) {
			const since =
				Math.floor(Date.now() / 1000) - days(args.days, 7, 90) * 86_400;
			const { results } = await env.DB.prepare(
				`SELECT id, received_at, library, name, alert_type, substr(text, 1, 300) AS text
				   FROM alerts WHERE received_at > ? AND (? IS NULL OR library = ?)
				  ORDER BY received_at DESC LIMIT 100`,
			)
				.bind(since, args.slug ?? null, args.slug ?? null)
				.all();
			return results;
		},
	},
	{
		name: "explain_alert",
		description:
			"One alert: what Cloudflare said, the library's failing checks and late jobs now, the runbook to read, and a fix prompt for Claude Code filled with the evidence.",
		inputSchema: {
			type: "object",
			properties: { id: { type: "string", description: "From list_alerts" } },
			required: ["id"],
		},
		async run(env, args) {
			const alert = await env.DB.prepare("SELECT * FROM alerts WHERE id = ?")
				.bind(String(args.id))
				.first<{
					id: string;
					received_at: number;
					library: string | null;
					name: string;
					text: string;
				}>();
			if (!alert) throw new Error(`No alert ${String(args.id)}`);
			const lib = libraries(env).find((one) => one.slug === alert.library);
			const now = lib ? await state(env, lib) : null;
			const failing =
				now && "checks" in now
					? now.checks
							.filter((check) => check.failing_since !== null)
							.map((check) => `${check.name} = ${check.value}`)
					: [];
			const runbook = runbookFor(`${alert.text} ${failing.join(" ")}`);
			const evidence = [
				alert.text.slice(0, 500),
				...failing.map((line) => `check ${line}`),
				...(now && "late" in now
					? now.late.map((job) => `job ${job} late`)
					: []),
			].join("; ");
			return {
				alert,
				now,
				runbook,
				fixPrompt: fixPrompt({
					alert: alert.name,
					slug: alert.library ?? "(shared)",
					time: new Date(alert.received_at * 1000).toISOString(),
					evidence,
					runbook,
				}),
			};
		},
	},
	{
		name: "job_runs",
		description:
			"A library's scheduled job runs: 'did every backup run this week?'. Daily jobs' runs and every failure are kept 30 days.",
		inputSchema: {
			type: "object",
			properties: {
				slug,
				job: {
					type: "string",
					description:
						"backup, reminders, snapshot, checks, emails, held-notices, webhooks, revoke-consents, rehost-covers; none for all",
				},
				days: { type: "number", description: "Default 7" },
			},
			required: ["slug"],
		},
		run: (env, args) =>
			core(env, find(env, args.slug)).opsJobRuns(
				typeof args.job === "string" ? args.job : null,
				days(args.days, 7, 30),
			),
	},
	{
		name: "delivery_trace",
		description:
			"Why did somebody not hear about a loan? One loan's path from its events to the held notice and webhooks: ids, kinds, times and statuses, never a person.",
		inputSchema: {
			type: "object",
			properties: {
				slug,
				loan_id: { type: "string", description: "The loan's id" },
			},
			required: ["slug", "loan_id"],
		},
		async run(env, args) {
			const trace = await core(env, find(env, args.slug)).opsDeliveryTrace(
				String(args.loan_id),
			);
			return trace ?? { found: false };
		},
	},
	{
		name: "query_events",
		description: `Read-only SQL over ${DATASET} (every library's counts). Columns: index1 library, blob1 kind (request, domain, check, job, snapshot), blob2 name, blob3 outcome, blob4 surface, double2 ms, double3 value, double4 weight; count with SUM(double4), never COUNT(). At most 1000 rows.`,
		inputSchema: {
			type: "object",
			properties: { sql: { type: "string" } },
			required: ["sql"],
		},
		async run(env, args) {
			const query = String(args.sql).trim().replace(/;\s*$/, "");
			if (!/^select\b/i.test(query) || query.includes(";"))
				throw new Error("One SELECT statement only.");
			const tables = [...query.matchAll(/\bfrom\s+([^\s,()]+)/gi)].map(
				(match) => match[1],
			);
			if (tables.some((table) => table !== DATASET))
				throw new Error(`Only ${DATASET} may be read.`);
			const limited = /\blimit\s+\d+\s*$/i.test(query)
				? query
				: `${query} LIMIT 1000`;
			return sql(env, limited);
		},
	},
	{
		name: "library_trends",
		description:
			"The light business view, week by week, from the exact daily snapshot: members, active members, items, loans, requests and how many were agreed, owners' answer time, invites, asks.",
		inputSchema: {
			type: "object",
			properties: {
				slug: { ...slug, description: "One library; none for all" },
				weeks: { type: "number", description: "Default 8" },
			},
		},
		run: (env, args) =>
			sql(
				env,
				`SELECT index1 AS library, toStartOfInterval(timestamp, INTERVAL '7' DAY) AS week,
				        blob2 AS metric, MAX(double3) AS value
				   FROM ${DATASET}
				  WHERE blob1 = 'snapshot' AND timestamp > NOW() - INTERVAL '${days(args.weeks, 8, 13) * 7}' DAY
				    ${typeof args.slug === "string" ? "AND index1 = $slug" : ""}
				  GROUP BY library, week, metric ORDER BY library, week, metric`,
				typeof args.slug === "string" ? { slug: args.slug } : {},
			),
	},
	{
		name: "compare_libraries",
		description:
			"Which library is growing or slowing: one snapshot metric for every library, this week against the first week of the span.",
		inputSchema: {
			type: "object",
			properties: {
				metric: {
					type: "string",
					description:
						"members, members_active_7d, members_active_30d, items, items_lendable, items_on_loan, loans_overdue, requests_7d, requests_agreed_7d, answer_median_s, invites_7d, asks_7d, asks_taken_7d",
				},
				weeks: { type: "number", description: "Default 4" },
			},
			required: ["metric"],
		},
		async run(env, args) {
			if (!/^[a-z0-9_]+$/.test(String(args.metric)))
				throw new Error("No such metric.");
			const span = days(args.weeks, 4, 13) * 7;
			const rows = await sql<{ library: string; first: number; last: number }>(
				env,
				`SELECT index1 AS library,
				        argMin(double3, timestamp) AS first, argMax(double3, timestamp) AS last
				   FROM ${DATASET}
				  WHERE blob1 = 'snapshot' AND blob2 = $metric
				    AND timestamp > NOW() - INTERVAL '${span}' DAY
				  GROUP BY library ORDER BY last DESC`,
				{ metric: String(args.metric) },
			);
			return rows.map((row) => ({ ...row, change: row.last - row.first }));
		},
	},
	{
		name: "recent_deploys",
		description:
			"When each library's core was last deployed, so 'it broke after Tuesday's release' can be checked against when failures began.",
		inputSchema: { type: "object", properties: {} },
		run: (env) =>
			Promise.all(
				libraries(env).map(async (lib) => {
					const now = await state(env, lib);
					return {
						library: lib.slug,
						deployedAt:
							"deployedAt" in now && now.deployedAt
								? new Date(now.deployedAt).toISOString()
								: null,
					};
				}),
			),
	},
	{
		name: "sampling_status",
		description:
			"How much is kept: each library's configured rates per Worker, and its points per day in cdl_events by kind, with the share kept in full (weight 1).",
		inputSchema: { type: "object", properties: {} },
		async run(env) {
			const volume = await sql(
				env,
				`SELECT index1 AS library, blob1 AS kind,
				        SUM(double4) / 7 AS per_day,
				        SUM(CASE WHEN double4 = 1 THEN 1 ELSE 0 END) / SUM(1) AS share_in_full
				   FROM ${DATASET}
				  WHERE timestamp > NOW() - INTERVAL '7' DAY
				  GROUP BY library, kind ORDER BY library, kind`,
			).catch((error: Error) => ({ unavailable: error.message }));
			return {
				rates: libraries(env).map((lib) => ({
					library: lib.slug,
					sampling: lib.sampling,
				})),
				volume,
			};
		},
	},
	{
		name: "run_check",
		description:
			"Run a library's checks now (one, or all) and keep the result. Safe and idempotent. Ask the operator first; call with confirm: true once they agree.",
		inputSchema: {
			type: "object",
			properties: {
				slug,
				check: { type: "string", description: "One check; none for all" },
				confirm,
			},
			required: ["slug"],
		},
		async run(env, args) {
			const lib = find(env, args.slug);
			const which = typeof args.check === "string" ? args.check : undefined;
			if (args.confirm !== true)
				return {
					wouldRun: `${which ?? "every check"} on ${lib.slug}`,
					ask: "Ask the operator, then call again with confirm: true.",
				};
			return core(env, lib).opsRunCheck(which);
		},
	},
	{
		name: "take_backup",
		description:
			"Take a library's database snapshot now, into its backups bucket. Safe; it replaces today's. Ask the operator first; call with confirm: true once they agree.",
		inputSchema: {
			type: "object",
			properties: { slug, confirm },
			required: ["slug"],
		},
		async run(env, args) {
			const lib = find(env, args.slug);
			if (args.confirm !== true)
				return {
					wouldRun: `a snapshot of ${lib.slug} now`,
					ask: "Ask the operator, then call again with confirm: true.",
				};
			return (await core(env, lib).opsTakeBackup()) ?? { failed: true };
		},
	},
];
