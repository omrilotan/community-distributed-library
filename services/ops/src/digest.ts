import { log } from "@cdl/contracts";
import { core, libraries, type Env } from "./env.ts";
import { isScanner } from "./relay.ts";

/**
 * The Monday email (docs/observability-plan.md, layer 3): for each library,
 * what is failing now, the week's alerts, and the week's numbers, to every
 * admin of every library. A quiet week says so in one line. Counts only.
 */
export async function digest(env: Env, at = Date.now()): Promise<string> {
	const week = Math.floor(at / 1000) - 7 * 86_400;
	const { results: rows } = await env.DB.prepare(
		"SELECT library, name, COUNT(*) AS n FROM alerts WHERE received_at > ? GROUP BY library, name",
	)
		.bind(week)
		.all<{ library: string | null; name: string; n: number }>();
	// Bots probing for weak spots: one count, not a line each.
	const probes = rows
		.filter((one) => isScanner(one.name))
		.reduce((sum, one) => sum + one.n, 0);
	const alerts = rows.filter((one) => !isScanner(one.name));
	const sections: string[] = [];
	let quiet = true;
	for (const lib of libraries(env)) {
		const lines: string[] = [];
		try {
			const now = await core(env, lib).opsStatus();
			for (const [part, state] of Object.entries(now.parts))
				if (state !== "ok") lines.push(`- ${part} is ${state}`);
			for (const job of now.late) lines.push(`- the ${job} job is late`);
			for (const check of now.checks.filter((one) => one.value > 0))
				lines.push(`- ${check.name} = ${check.value} (${check.severity})`);
		} catch {
			lines.push("- did not answer");
		}
		for (const alert of alerts.filter((one) => one.library === lib.slug))
			lines.push(`- alert: ${alert.name} (${alert.n} times)`);
		if (lines.length) quiet = false;
		const numbers = await weekNumbers(env, lib.slug);
		sections.push(
			[
				`${lib.slug} (https://${lib.host})`,
				...(lines.length ? lines : ["- nothing to look at"]),
				...(numbers ? [`  ${numbers}`] : []),
			].join("\n"),
		);
	}
	const shared = alerts.filter((one) => !one.library);
	if (shared.length) {
		quiet = false;
		sections.push(
			[
				"Shared Workers and certificates",
				...shared.map((alert) => `- alert: ${alert.name} (${alert.n} times)`),
			].join("\n"),
		);
	}
	if (probes)
		sections.push(
			`Bots probed for weak spots ${probes} times (Cloudflare's "Potential vulnerability scan" Issues): nothing to do.`,
		);
	return [
		quiet
			? "Nothing to report this week: every library works, and no alert fired."
			: "This week in the libraries:",
		"",
		sections.join("\n\n"),
		"",
		"Ask the ops MCP (fleet_status, explain_alert) for more; each runbook is in docs/runbooks/.",
	].join("\n");
}

/** The latest snapshot's numbers, in one line. */
async function weekNumbers(env: Env, slug: string): Promise<string | null> {
	if (!env.ANALYTICS_SQL) return null;
	try {
		const { data } = await env.ANALYTICS_SQL.query<{
			metric: string;
			value: number;
		}>({
			query: `SELECT blob2 AS metric, argMax(double3, timestamp) AS value
			          FROM events.analyticsEngine."cdl_events"
			         WHERE blob1 = 'snapshot' AND index1 = $slug
			           AND timestamp > NOW() - INTERVAL '2' DAY
			         GROUP BY metric`,
			params: { slug },
		});
		const get = (name: string) =>
			data.find((row) => row.metric === name)?.value ?? 0;
		return `${get("members")} members (${get("members_active_7d")} active), ${get("items")} items, ${get("requests_7d")} requests (${get("requests_agreed_7d")} agreed), ${get("loans_overdue")} overdue`;
	} catch {
		return null;
	}
}

/** Sends the digest to every admin of every library, once each. */
export async function sendDigest(env: Env): Promise<number> {
	if (!env.EMAIL || !env.FROM_ADDRESS) return 0;
	const text = await digest(env);
	const to = new Set<string>();
	for (const lib of libraries(env))
		for (const address of await core(env, lib)
			.opsAdmins()
			.catch(() => []))
			to.add(address.toLowerCase());
	let sent = 0;
	for (const address of to) {
		await env.EMAIL.send({
			from: { name: "Community Distributed Library", email: env.FROM_ADDRESS },
			to: address,
			subject: "The libraries this week",
			text,
		}).then(
			() => {
				sent += 1;
			},
			(error: unknown) => log.error("digest.not_sent", {}, error),
		);
	}
	return sent;
}
