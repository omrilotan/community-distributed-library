import { log } from "@cdl/contracts";
import { core, libraries, type Env } from "./env.ts";
import { runbookFor } from "./tools.ts";

/**
 * Cloudflare's Issues automations cannot be filtered by type, so the failure
 * policies post only to the ops inbox (scripts/observe.mjs), and ops sends
 * the email: a real failure goes to the library's admins (a shared Worker's
 * goes to every library's admins), and the operator; a scanner's probes go
 * to the inbox and the weekly digest, never to anyone's mail.
 */

/** Issues Cloudflare raises for bots probing for weak spots, not failures. */
export const SCANNER = /^Potential vulnerability scan\b/;

/** Whether an alert is a scanner's probing rather than a failure. */
export const isScanner = (name: string) => SCANNER.test(name);

/** Who hears of an alert: addresses once each, in lower case. */
export async function recipients(
	env: Env,
	library: string | null,
): Promise<string[]> {
	const libs = libraries(env).filter(
		(lib) => library === null || lib.slug === library,
	);
	const to = new Set<string>();
	if (env.ALERTS_EMAIL) to.add(env.ALERTS_EMAIL.trim().toLowerCase());
	for (const lib of libs)
		for (const address of await core(env, lib)
			.opsAdmins()
			.catch(() => []))
			to.add(address.trim().toLowerCase());
	return [...to];
}

/** Emails one failure alert; returns how many it went to. */
export async function relay(
	env: Env,
	alert: { library: string | null; name: string; text: string },
): Promise<number> {
	if (isScanner(alert.name) || !env.EMAIL || !env.FROM_ADDRESS) return 0;
	const where = alert.library
		? (libraries(env).find((lib) => lib.slug === alert.library)?.host ??
			alert.library)
		: "a shared Worker";
	const text = [
		alert.text,
		"",
		`Runbook: ${runbookFor(alert.text)}`,
		"Ask the ops MCP (explain_alert) for what is failing now and a prompt for Claude Code.",
	].join("\n");
	let sent = 0;
	for (const address of await recipients(env, alert.library))
		await env.EMAIL.send({
			from: { name: "Community Distributed Library", email: env.FROM_ADDRESS },
			to: address,
			subject: `Failing in ${where}: ${alert.name}`.slice(0, 200),
			text,
		}).then(
			() => {
				sent += 1;
			},
			(error: unknown) => log.error("alert.not_relayed", {}, error),
		);
	return sent;
}
