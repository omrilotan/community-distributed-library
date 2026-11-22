#!/usr/bin/env node
// Refuses a bare console call in a Worker's code: every log line goes
// through `log` from @cdl/contracts (telemetry.ts), so it is one JSON event
// with a name that can be counted and alerted on. A line for development
// only says so in a `telemetry:` comment just above it. And every runbook an
// alert names (docs/runbooks/) is there.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { root } from "./libraries.mjs";

const problems = [];
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
	);
const sources = [
	...readdirSync(join(root, "services")).map((name) =>
		join(root, "services", name, "src"),
	),
	join(root, "packages", "contracts", "src"),
];
for (const src of sources) {
	let files;
	try {
		files = walk(src);
	} catch {
		continue;
	}
	for (const file of files.filter(
		(name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
	)) {
		const text = readFileSync(file, "utf8");
		for (const [, page] of text.matchAll(
			/(?:docs\/runbooks\/|runbook: ")([\w-]+\.md)/g,
		))
			if (!existsSync(join(root, "docs", "runbooks", page)))
				problems.push(
					`${file.slice(root.length)} names docs/runbooks/${page}, which is missing`,
				);
		// The helper itself is the one place that calls console.
		if (file.endsWith(join("contracts", "src", "telemetry.ts"))) continue;
		const lines = text.split("\n");
		lines.forEach((line, at) => {
			if (!/\bconsole\.(log|info|warn|error|debug)\(/.test(line)) return;
			if (/telemetry:/.test(lines[at - 1] ?? "")) return;
			problems.push(`${file.slice(root.length)}:${at + 1}`);
		});
	}
}
if (problems.length) {
	console.error(
		`✗ Bare console calls (use log from @cdl/contracts) or missing runbooks:\n${problems.map((line) => `  ${line}`).join("\n")}`,
	);
	process.exit(1);
}
console.log("✓ Every Worker logs through log, and every runbook is there");
