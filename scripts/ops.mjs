#!/usr/bin/env node
// Set up the operator's MCP (services/ops): its database, its address, its
// two keys, and the Worker itself. Usage:
//
//   node scripts/ops.mjs [--host ops.example.org] [--dry-run]
//
// The address defaults to ops.<the first library's domain>. Run it again
// after adding or removing a library, so the ops Worker reaches each one;
// then npm run observe, so the alerts reach it too. It keeps what it made.
//
// Keys, in .keys/ (git ignores it): ops.key is what an MCP client sends as
// its bearer token, or what the operator types on its sign-in page;
// alerts.key is what Cloudflare's alert webhook sends.
// Neither is ever printed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
	manifest,
	manifestPath,
	npx,
	root,
	sharedConfigFor,
} from "./libraries.mjs";

const { values } = parseArgs({
	options: { host: { type: "string" }, "dry-run": { type: "boolean" } },
});
const dry = values["dry-run"];
const data = manifest();
const fail = (message) => {
	console.error(`✗ ${message}`);
	process.exit(1);
};

function wrangler(args, input) {
	if (dry) {
		console.log(`  would run wrangler ${args.join(" ")}`);
		return "";
	}
	const result = spawnSync(npx[0], [...npx.slice(1), "wrangler", ...args], {
		cwd: root,
		encoding: "utf8",
		input,
		stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
	});
	return result.status === 0 ? result.stdout : null;
}

/** A key in .keys/, made once. */
function key(name) {
	const path = `${root}.keys/${name}`;
	if (existsSync(path)) return readFileSync(path, "utf8").trim();
	const made = randomBytes(32).toString("base64url");
	if (!dry) {
		mkdirSync(`${root}.keys`, { recursive: true });
		writeFileSync(path, `${made}\n`, { mode: 0o600 });
	}
	return made;
}

console.log("━━ The ops MCP");
const first = data.libraries[0].host.split(".");
const zone = data.shared?.reports?.zone ?? first.slice(-2).join(".");
const host = values.host ?? data.shared?.ops?.host ?? `ops.${zone}`;

let databaseId = data.shared?.ops?.databaseId;
if (!databaseId) {
	const list = JSON.parse(wrangler(["d1", "list", "--json"]) || "[]");
	databaseId = list.find((db) => db.name === "cdl-ops")?.uuid;
	if (!databaseId) {
		if (wrangler(["d1", "create", "cdl-ops"]) === null)
			fail("Could not make the cdl-ops database.");
		databaseId = dry
			? "<cdl-ops id>"
			: JSON.parse(wrangler(["d1", "list", "--json"]) || "[]").find(
					(db) => db.name === "cdl-ops",
				)?.uuid;
	}
	if (!databaseId) fail("The cdl-ops database is nowhere to be found.");
}
// Where the grants of clients that sign in are kept.
let oauthKv = data.shared?.ops?.oauthKv;
if (!oauthKv) {
	const find = () =>
		JSON.parse(wrangler(["kv", "namespace", "list"]) || "[]").find(
			(ns) => ns.title === "cdl-ops-oauth",
		)?.id;
	oauthKv = find();
	if (!oauthKv) {
		if (wrangler(["kv", "namespace", "create", "cdl-ops-oauth"]) === null)
			fail("Could not make the cdl-ops-oauth namespace.");
		oauthKv = dry ? "<cdl-ops-oauth id>" : find();
	}
	if (!oauthKv) fail("The cdl-ops-oauth namespace is nowhere to be found.");
}
data.shared = {
	...data.shared,
	ops: { host, zone, databaseId, oauthKv },
};
if (!dry) writeFileSync(manifestPath(), `${JSON.stringify(data, null, 2)}\n`);
console.log(`✓ ${host}, database cdl-ops, namespace cdl-ops-oauth`);

const token = key("ops.key");
const alerts = key("alerts.key");

const deploy = dry
	? { status: 0 }
	: spawnSync("node", ["scripts/deploy.mjs", "shared", "ops"], {
			cwd: root,
			stdio: "inherit",
		});
if (deploy.status !== 0) fail("The ops Worker did not deploy.");

const config = dry ? "<config>" : sharedConfigFor(manifest(), "ops");
for (const [name, value] of [
	["OPS_TOKEN", token],
	["ALERTS_SECRET", alerts],
])
	if (wrangler(["secret", "put", name, "-c", config], value) === null)
		fail(`Could not set the ${name} secret.`);
console.log("✓ The ops Worker has its keys");

console.log(`
Connect an MCP client (the key is never printed; this reads it):

  claude mcp add --transport http cdl-ops https://${host}/mcp \\
    --header "Authorization: Bearer $(cat .keys/ops.key)"

Or add https://${host}/mcp as a custom connector in Claude (web, desktop,
mobile): it asks for the key once, on a sign-in page.

Then run npm run observe, so every alert reaches it too.`);
