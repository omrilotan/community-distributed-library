import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const CORE = process.env.CORE_URL ?? "http://localhost:8787";

/**
 * Signing in costs a rationed magic link, and a suite that runs twice in a
 * quarter of an hour would hit the limit. Clearing the counter is the test
 * harness's business; the limit itself stays as production has it.
 */
export default async function setup(): Promise<void> {
	await waitFor(`${CORE}/health`);
	// The suite is written for a books library, whatever the local one was left
	// lending (npm run library:things); the "things" project switches it itself.
	const books = await fetch(`${CORE}/v1/dev/library-type`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ type: "books" }),
	});
	if (books.status !== 204)
		throw new Error(
			`Could not make the local library lend books: ${books.status}`,
		);
	try {
		await run(
			"npx",
			[
				"wrangler",
				"d1",
				"execute",
				"cdl-core",
				"--local",
				"--persist-to",
				".wrangler/state",
				"-c",
				"services/core/wrangler.jsonc",
				"--command",
				"DELETE FROM rate_limits",
			],
			{ cwd: new URL("../../..", import.meta.url).pathname },
		);
	} catch (error) {
		// A fresh database has nothing to clear, and wrangler says so loudly.
		console.warn(
			"[e2e] could not clear rate limits:",
			String(error).slice(0, 120),
		);
	}
}

async function waitFor(url: string, attempts = 60): Promise<void> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// not up yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`${url} never answered`);
}
