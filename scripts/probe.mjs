#!/usr/bin/env node
// Asks every running library, from outside Cloudflare, whether it works.
// Usage:
//
//   npm run probe
//
// The hosts are CDL_LIBRARY_HOSTS (comma or space separated: the GitHub
// probe, .github/workflows/probe.yml, which has no manifest), else the
// manifest's. Needs nothing installed, so the probe runs without npm ci.
// Exits non-zero when any library fails, one line per failure.
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Asks every library, from outside Cloudflare, whether it works: its home
 * page, its health route (services/core/src/health.ts) and its assistant
 * sign-in. Returns one line per failure.
 */
export async function probe(hosts) {
	const problems = [];
	const ask = async (url, read) => {
		try {
			const reply = await fetch(url, {
				redirect: "manual",
				signal: AbortSignal.timeout(15_000),
			});
			const said = await read(reply);
			if (said) problems.push(`${url}: ${said}`);
		} catch (error) {
			problems.push(`${url}: ${error.cause?.code ?? error.message}`);
		}
	};
	const status = async (reply) =>
		reply.status < 400 ? null : `answered ${reply.status}`;
	await Promise.all(
		hosts.flatMap((host) => [
			ask(`https://${host}/`, status),
			ask(`https://${host}/api/v1/health`, async (reply) => {
				const body = await reply.json().catch(() => null);
				if (reply.ok && body?.ok) return null;
				if (!body?.parts) return `answered ${reply.status}`;
				const parts = Object.entries(body.parts)
					.filter(([, state]) => state !== "ok")
					.map(([part]) => part);
				return [
					parts.length ? `failing: ${parts.join(", ")}` : "",
					body.late?.length ? `jobs late: ${body.late.join(", ")}` : "",
				]
					.filter(Boolean)
					.join("; ");
			}),
			ask(`https://mcp.${host}/.well-known/oauth-authorization-server`, status),
		]),
	);
	return problems.sort();
}

/** The hosts to ask: the variable, else the manifest's libraries. */
function hosts() {
	if (process.env.CDL_LIBRARY_HOSTS)
		return process.env.CDL_LIBRARY_HOSTS.split(/[\s,]+/).filter(Boolean);
	const path =
		process.env.CDL_LIBRARIES ||
		new URL("../libraries.json", import.meta.url).pathname;
	if (!existsSync(path)) {
		console.error(`No CDL_LIBRARY_HOSTS and no manifest at ${path}.`);
		process.exit(2);
	}
	return JSON.parse(readFileSync(path, "utf8")).libraries.map(
		(lib) => lib.host,
	);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const list = hosts();
	const problems = await probe(list);
	if (problems.length) {
		console.error(problems.map((line) => `✗ ${line}`).join("\n"));
		process.exit(1);
	}
	console.log(`✓ ${list.length} libraries answer, and their jobs run`);
}
