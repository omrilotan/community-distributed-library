#!/usr/bin/env node
// Deploy libraries. Usage:
//
//   node scripts/deploy.mjs <library|all> [service ...]
//   node scripts/deploy.mjs shared [metadata|reports|landing ...]
//
// Libraries come from the manifest (scripts/libraries.mjs). For each, in the
// manifest's order: the database migrations of the services being deployed,
// then those Workers in binding order (notify, convo, core, mcp, web), each
// from a config written for that library. A failure stops that library
// before any further Worker of it deploys, so no Worker runs ahead of its
// schema; the other libraries still go, and the run ends in failure.
//
// Needs CLOUDFLARE_API_TOKEN in the environment.
import { spawnSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
import { check } from "./check-libraries.mjs";
import {
	SERVICES,
	SHARED_SERVICES,
	configFor,
	library,
	manifest,
	npx,
	root,
	sharedConfigFor,
} from "./libraries.mjs";

const [target, ...only] = process.argv.slice(2);
const data = manifest();
if (!target) {
	console.error(
		"Usage: node scripts/deploy.mjs <library|all|shared> [service ...]\n" +
			`Libraries: ${data.libraries.map((entry) => entry.slug).join(", ")}\n` +
			`Services: ${SERVICES.map((service) => service.name).join(", ")}\n` +
			`Shared: ${SHARED_SERVICES.map((service) => service.name).join(", ")}`,
	);
	process.exit(2);
}
const known = target === "shared" ? SHARED_SERVICES : SERVICES;
for (const name of only)
	if (!known.some((service) => service.name === name)) {
		console.error(`No service "${name}"`);
		process.exit(2);
	}

const problems = check(data);
if (problems.length) {
	console.error(problems.map((line) => `✗ ${line}`).join("\n"));
	process.exit(1);
}

function run(command, args, { cwd = root, env = {} } = {}) {
	console.log(`\n$ ${[command, ...args].join(" ")}`);
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		env: { ...process.env, ...env },
	});
	// A command that never started has no exit code to explain itself with.
	if (result.error) console.error(`✗ ${result.error.message}`);
	return result.status === 0;
}

/** Migrations, then the Worker, from one written config. */
function steps(service, config) {
	const list = [];
	if (service.database) {
		const resolved = unstable_readConfig({ config }, { hideWarnings: true });
		for (const database of resolved.d1_databases ?? [])
			list.push(() =>
				run(npx[0], [
					...npx.slice(1),
					"wrangler",
					"d1",
					"migrations",
					"apply",
					database.database_name,
					"--remote",
					"-c",
					config,
				]),
			);
	}
	const cwd = `${root}${service.dir}`;
	if (service.name === "web")
		// The Vite plugin reads the written config and flattens it into
		// dist/server/wrangler.json, which is what deploys.
		list.push(
			() =>
				run(npx[0], [...npx.slice(1), "vinext", "build"], {
					cwd,
					env: { CDL_WRANGLER_CONFIG: config, CLOUDFLARE_ENV: undefined },
				}) &&
				run(
					npx[0],
					[
						...npx.slice(1),
						"vinext-cloudflare",
						"deploy",
						"--skip-build",
						"--config",
						"dist/server/wrangler.json",
					],
					{ cwd, env: { CLOUDFLARE_ENV: undefined } },
				),
		);
	else if (service.name === "landing")
		list.push(
			() =>
				run("node", ["build.mjs"], { cwd }) &&
				run(npx[0], [...npx.slice(1), "wrangler", "deploy", "-c", config], {
					cwd,
				}),
		);
	else
		list.push(() =>
			run(npx[0], [...npx.slice(1), "wrangler", "deploy", "-c", config]),
		);
	return list;
}

const pick = (list) =>
	list.filter((service) => only.length === 0 || only.includes(service.name));

if (target === "shared") {
	const list = pick(SHARED_SERVICES).flatMap((service) =>
		steps(service, sharedConfigFor(data, service.name)),
	);
	if (!list.every((step) => step())) {
		console.error("\n✗ Shared Workers stopped.");
		process.exit(1);
	}
	console.log("\n✓ Deployed shared Workers");
	process.exit(0);
}

const libraries = target === "all" ? data.libraries : [library(data, target)];
const failed = [];
for (const { slug } of libraries) {
	console.log(`\n━━ ${slug}`);
	const list = pick(SERVICES).flatMap((service) =>
		steps(service, configFor(data, slug, service.name)),
	);
	if (!list.every((step) => step())) {
		console.error(`\n✗ ${slug} stopped; its later Workers were not deployed.`);
		failed.push(slug);
	}
}

if (failed.length) {
	console.error(`\n✗ Failed: ${failed.join(", ")}`);
	process.exit(1);
}
console.log(`\n✓ Deployed ${libraries.map((entry) => entry.slug).join(", ")}`);
