#!/usr/bin/env node
// Pull a library's production D1 into local development, on demand:
//   npm run db:pull                        # the manifest's last library, all three databases
//   npm run db:pull -- core                # one of: core, metadata, convo
//   npm run db:pull -- --library staging   # another library in the manifest
//
// Full dumps (schema + data + migration history) replace the local databases,
// then credentials are scrubbed: sessions, sign-in links, API tokens and
// consent codes never leave production. Covers keep pointing at the public
// bucket, so nothing else needs copying. Stop `npm run dev` first.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	configFor,
	library,
	manifest,
	root,
	sharedConfigFor,
} from "./libraries.mjs";

const stateDir = process.env.CDL_STATE_DIR ?? ".wrangler/state";
// Whichever library is pulled, it lands in the local databases, named as the
// templates name them; metadata is shared by all.
const args = process.argv.slice(2);
const at = args.indexOf("--library");
const data = manifest();
const from = library(
	data,
	at >= 0 ? args[at + 1] : data.libraries[data.libraries.length - 1].slug,
);
const databases = {
	core: {
		name: "cdl-core",
		remote: `${from.slug}-core`,
		remoteConfig: () => configFor(data, from.slug, "core"),
		config: "services/core/wrangler.jsonc",
	},
	metadata: {
		name: "cdl-metadata",
		remote: "cdl-metadata",
		remoteConfig: () => sharedConfigFor(data, "metadata"),
		config: "services/metadata/wrangler.jsonc",
	},
	convo: {
		name: "cdl-convo",
		remote: `${from.slug}-convo`,
		remoteConfig: () => configFor(data, from.slug, "convo"),
		config: "services/convo/wrangler.jsonc",
	},
};
const SCRUB = {
	core: [
		"DELETE FROM sessions",
		"DELETE FROM magic_links",
		"DELETE FROM consent_codes",
		"DELETE FROM access_tokens",
		// A local change would otherwise send members' real webhooks a signed
		// event, and their devices a push, from a laptop.
		"DELETE FROM webhook_deliveries",
		"UPDATE webhooks SET disabled_at = unixepoch(), secret = ''",
		"DELETE FROM push_subscriptions",
		"DELETE FROM pending_emails",
	],
};

const picked = args.filter((arg) => arg in databases);
const targets = picked.length ? picked : Object.keys(databases);

// A running dev server holds the SQLite files open; replacing them underneath it corrupts both.
if (!process.env.CDL_STATE_DIR && devServerRunning()) {
	console.error("Stop `npm run dev` (port 8787 is in use) before pulling.");
	process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "cdl-pull-"));
for (const key of targets) {
	const { name, remote, remoteConfig, config } = databases[key];
	const local = [
		"d1",
		"execute",
		name,
		"--local",
		"--persist-to",
		stateDir,
		"-c",
		config,
	];
	const dump = join(work, `${name}.sql`);

	console.log(`[${key}] exporting ${remote} from production…`);
	wrangler([
		"d1",
		"export",
		remote,
		"--remote",
		"--output",
		dump,
		"-c",
		remoteConfig(),
	]);
	// The dump goes table by table (create, then rows). A row can reference a table the
	// dump has not created yet, and D1 checks that on insert. So: every CREATE first,
	// then the rows, with foreign keys deferred to the end of the batch.
	writeFileSync(dump, reorder(readFileSync(dump, "utf8")));

	console.log(`[${key}] replacing local ${name}…`);
	dropAllTables(local);
	wrangler([...local, "--file", dump]);
	for (const statement of SCRUB[key] ?? [])
		wrangler([...local, "--command", statement]);
	console.log(`[${key}] done${SCRUB[key] ? " (credentials scrubbed)" : ""}`);
}
rmSync(work, { recursive: true, force: true });
console.log(
	"Local databases now mirror production. Sign in locally with your own email (DEV_AUTH prints the link).",
);

function reorder(sql) {
	const statements = sql
		.split(/;\s*\n/)
		.map((statement) => statement.trim())
		.filter((statement) => statement && !/^PRAGMA/i.test(statement));
	const creates = statements.filter((statement) => /^CREATE /i.test(statement));
	const rest = statements.filter((statement) => !/^CREATE /i.test(statement));
	return (
		["PRAGMA defer_foreign_keys = true", ...creates, ...rest].join(";\n") +
		";\n"
	);
}

/** Empty the local database in place (the file may be open elsewhere; dropping tables is safe). */
function dropAllTables(local) {
	const listing = spawnSync(
		"npx",
		[
			"wrangler",
			...local,
			"--json",
			"--command",
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
		],
		{ cwd: root, encoding: "utf8" },
	);
	let tables = [];
	try {
		tables = JSON.parse(listing.stdout)[0].results.map((row) => row.name);
	} catch {
		return; // brand-new database, nothing to drop
	}
	if (!tables.length) return;
	wrangler([
		...local,
		"--command",
		[
			"PRAGMA defer_foreign_keys = true",
			...tables.map((table) => `DROP TABLE IF EXISTS "${table}"`),
		].join("; "),
	]);
}

function wrangler(args) {
	execFileSync("npx", ["wrangler", ...args], {
		cwd: root,
		stdio: ["ignore", "ignore", "inherit"],
	});
}

function devServerRunning() {
	const probe = spawnSync(
		"/usr/sbin/lsof",
		["-nP", "-iTCP:8787", "-sTCP:LISTEN"],
		{
			encoding: "utf8",
		},
	);
	return (probe.stdout ?? "").trim().split("\n").filter(Boolean).length > 1;
}
