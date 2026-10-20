#!/usr/bin/env node
// One command for local development: migrate, then run the API workers and
// the web app side by side with prefixed output. Ctrl-C stops both.
import { spawn } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(name, args, { prefix } = {}) {
	const child = spawn(npm, args, {
		cwd: root,
		env: process.env,
		stdio: prefix ? ["inherit", "pipe", "pipe"] : "inherit",
	});
	if (prefix) {
		const tag = `\x1b[36m[${name}]\x1b[0m `;
		const relay = (stream, out) => {
			let rest = "";
			stream.on("data", (chunk) => {
				const lines = (rest + chunk).split("\n");
				rest = lines.pop() ?? "";
				for (const line of lines) out.write(tag + line + "\n");
			});
			stream.on("end", () => rest && out.write(tag + rest + "\n"));
		};
		relay(child.stdout, process.stdout);
		relay(child.stderr, process.stderr);
	}
	return child;
}

// Migrations are idempotent and fast; running them every start means a fresh
// clone works with `npm run dev` alone.
await new Promise((resolve, reject) => {
	run("migrate", ["run", "db:migrate"]).on("exit", (code) =>
		code === 0
			? resolve()
			: reject(new Error(`db:migrate exited with ${code}`)),
	);
});

// The API and MCP servers keep their state in the same folder, and two
// workerd processes opening it at once can find its database locked
// (SQLITE_BUSY) and die. So they start one after the other.
async function answers(url, seconds) {
	for (let i = 0; i < seconds; i++) {
		try {
			if ((await fetch(url)).ok) return true;
		} catch {
			// Not up yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	return false;
}

// The web app comes last: its own runtime takes the first free debugger port,
// which would otherwise be the one the MCP server asks for.
const children = [run("api", ["run", "dev:api"], { prefix: true })];
if (!(await answers("http://localhost:8787/health", 120)))
	console.error("[dev] the API did not answer; starting the rest anyway");
children.push(run("mcp", ["run", "dev:mcp"], { prefix: true }));
await answers("http://localhost:8788/", 60);
children.push(run("web", ["run", "dev:web"], { prefix: true }));

const stop = () => {
	for (const child of children) child.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
	child.on("exit", (code) => {
		// One side dying should not leave the other half running silently.
		stop();
		process.exitCode = code ?? 1;
	});
}
