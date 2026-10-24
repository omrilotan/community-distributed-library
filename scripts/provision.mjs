#!/usr/bin/env node
// Open a new library: make its Cloudflare resources, add it to the manifest,
// deploy it, set its secrets, and make its first admin. Usage:
//
//   node scripts/provision.mjs <slug> --host <host> --name "<name>" \
//     --centre <lat,lng> --admin <email> [--type books|things] \
//     [--from-name "<sender>"] [--address <email>] [--zone-id <id>]
//     [--no-backups] [--dry-run]
//
// Run it again after a failure: what exists already is found and kept.
//
// Needs in the environment (see docs/self-hosting.md): CLOUDFLARE_API_TOKEN
// and RESEND_API_KEY. The account is the one the token reaches, or
// CLOUDFLARE_ACCOUNT_ID when it reaches several.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { webcrypto } from "node:crypto";
import { configFor, manifestPath, root } from "./libraries.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		host: { type: "string" },
		name: { type: "string" },
		centre: { type: "string" },
		radius: { type: "string", default: "3000" },
		admin: { type: "string" },
		type: { type: "string", default: "books" },
		"from-name": { type: "string" },
		address: { type: "string" },
		"zone-id": { type: "string" },
		// No nightly database snapshot, and no bucket to keep it in.
		"no-backups": { type: "boolean", default: false },
		"dry-run": { type: "boolean", default: false },
	},
});
const [slug] = positionals;
const fail = (message) => {
	console.error(`✗ ${message}`);
	process.exit(1);
};
if (!slug || !/^[a-z][a-z0-9-]{1,39}$/.test(slug))
	fail("Give the library a slug: lowercase letters, digits and dashes.");
for (const key of ["host", "name", "centre", "admin"])
	if (!values[key]) fail(`--${key} is missing.`);
if (!["books", "things"].includes(values.type))
	fail("--type is books or things.");
const centre = values.centre.split(",").map(Number);
if (centre.length !== 2 || centre.some((n) => !Number.isFinite(n)))
	fail("--centre is latitude,longitude, for example 51.6012,-0.1924.");
const admin = values.admin.trim().toLowerCase();
const dry = values["dry-run"];
for (const key of ["CLOUDFLARE_API_TOKEN", "RESEND_API_KEY"])
	if (!process.env[key] && !dry) fail(`${key} is not set.`);

// The manifest: this operator's, or a new one for a first library.
const path = manifestPath().endsWith("libraries.example.json")
	? `${root}libraries.json`
	: manifestPath();
const data = existsSync(path)
	? JSON.parse(readFileSync(path, "utf8"))
	: { accountId: process.env.CLOUDFLARE_ACCOUNT_ID, shared: {}, libraries: [] };
data.accountId ||= await onlyAccount();
if (data.libraries.some((entry) => entry.slug === slug && entry.provisioned))
	fail(`${slug} is already open.`);

const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: data.accountId };

/** The one Cloudflare account the token reaches. */
async function onlyAccount() {
	if (dry) return "<account id>";
	const reply = await fetch("https://api.cloudflare.com/client/v4/accounts", {
		headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
	});
	const accounts = (await reply.json()).result ?? [];
	if (accounts.length === 1) return accounts[0].id;
	fail(
		accounts.length
			? `The token reaches ${accounts.length} accounts (${accounts.map((a) => `${a.name}: ${a.id}`).join(", ")}). Set CLOUDFLARE_ACCOUNT_ID to one.`
			: "The token reaches no account. Check it has Account Settings: Read.",
	);
}
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

/** Runs wrangler; returns its output, or null when it failed. */
function wrangler(args, { input, quiet } = {}) {
	console.log(`$ wrangler ${args.join(" ")}`);
	if (dry) return "";
	const result = spawnSync(npx, ["wrangler", ...args], {
		cwd: root,
		env,
		input,
		encoding: "utf8",
		stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
	});
	if (!quiet) process.stdout.write(result.stdout ?? "");
	if (result.status !== 0) {
		process.stderr.write(result.stderr ?? "");
		return null;
	}
	return result.stdout;
}

/** Wrangler's JSON listing; `kv namespace list` prints JSON unasked. */
function json(args) {
	const flag = args[0] === "kv" ? [] : ["--json"];
	const out = wrangler([...args, ...flag], { quiet: true });
	if (dry) return [];
	if (out === null) fail(`wrangler ${args.join(" ")} failed.`);
	return JSON.parse(out);
}

/** A D1 database by name, made if missing. */
function database(name) {
	const find = () => json(["d1", "list"]).find((db) => db.name === name);
	const found = find();
	if (found) return found.uuid;
	if (wrangler(["d1", "create", name]) === null)
		fail(`Could not create ${name}.`);
	return dry ? `<${name} id>` : find()?.uuid;
}

function bucket(name) {
	const out = wrangler(["r2", "bucket", "create", name], { quiet: true });
	if (out === null && !dry) {
		const list = wrangler(["r2", "bucket", "list"], { quiet: true }) ?? "";
		if (!list.includes(name)) fail(`Could not create bucket ${name}.`);
	}
}

function kv(title) {
	const find = () =>
		json(["kv", "namespace", "list"]).find((ns) => ns.title === title);
	const found = find();
	if (found) return found.id;
	if (wrangler(["kv", "namespace", "create", title]) === null)
		fail(`Could not create KV namespace ${title}.`);
	return dry ? `<${title} id>` : find()?.id;
}

/** The zone the host is in: its id and its domain. */
async function findZone(host) {
	if (values["zone-id"])
		return { id: values["zone-id"], name: host.split(".").slice(-2).join(".") };
	if (dry)
		return { id: "<zone id>", name: host.split(".").slice(-2).join(".") };
	const labels = host.split(".");
	for (let at = 0; at < labels.length - 1; at += 1) {
		const name = labels.slice(at).join(".");
		const reply = await fetch(
			`https://api.cloudflare.com/client/v4/zones?name=${name}&account.id=${data.accountId}`,
			{ headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } },
		);
		const body = await reply.json();
		if (body.result?.[0]?.id) return body.result[0];
	}
	fail(`No zone in this account holds ${host}. Pass --zone-id.`);
}

/** A Web Push key pair: the public half as base64url, the private as a JWK. */
async function vapid() {
	const keys = await webcrypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	const raw = Buffer.from(
		await webcrypto.subtle.exportKey("raw", keys.publicKey),
	);
	const { kty, crv, d, x, y } = await webcrypto.subtle.exportKey(
		"jwk",
		keys.privateKey,
	);
	return {
		publicKey: raw.toString("base64url"),
		privateJwk: JSON.stringify({ kty, crv, d, x, y }),
	};
}

/** A ULID-shaped id: 26 characters of Crockford base32. */
function ulid() {
	const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
	let time = Date.now();
	let out = "";
	for (let i = 0; i < 10; i += 1) {
		out = alphabet[time % 32] + out;
		time = Math.floor(time / 32);
	}
	for (const byte of webcrypto.getRandomValues(new Uint8Array(16)))
		out += alphabet[byte % 32];
	return out;
}

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;

function save() {
	if (dry) return console.log(JSON.stringify(data, null, 2));
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
	console.log(`Saved ${path}`);
}

function deploy(args) {
	console.log(`$ node scripts/deploy.mjs ${args.join(" ")}`);
	if (dry) return;
	const result = spawnSync("node", ["scripts/deploy.mjs", ...args], {
		cwd: root,
		env: { ...env, CDL_LIBRARIES: path },
		stdio: "inherit",
	});
	if (result.status !== 0) fail(`Deploy of ${args.join(" ")} failed.`);
}

// 1. The Workers every library shares, the first time.
data.shared ??= {};
const firstLibrary = !data.shared.metadata?.databaseId;
if (firstLibrary) {
	console.log("\n━━ Shared: the book lookup cache");
	data.shared.metadata = { databaseId: database("cdl-metadata") };
}

// 2. This library's storage.
console.log(`\n━━ ${slug}: storage`);
// Mail goes out from the domain itself, such as our-street@example.co.uk.
const zone = await findZone(values.host);
let lib = data.libraries.find((entry) => entry.slug === slug);
if (!lib) {
	const keys = await vapid();
	lib = {
		slug,
		host: values.host,
		address: values.address ?? `${slug}@${zone.name}`,
		fromName: values["from-name"] ?? values.name,
		vapidPublicKey: keys.publicKey,
		...(values["no-backups"] ? { backups: false } : {}),
		databases: {},
		oauthKv: "",
	};
	// The private half stays on this machine (git ignores .keys/), so a run
	// that stops before setting the secret can set it next time.
	if (!dry) {
		mkdirSync(`${root}.keys`, { recursive: true });
		writeFileSync(`${root}.keys/${slug}.vapid.json`, keys.privateJwk, {
			mode: 0o600,
		});
	}
	data.libraries.push(lib);
}
lib.databases.core ||= database(`${slug}-core`);
lib.databases.convo ||= database(`${slug}-convo`);
lib.oauthKv ||= kv(`${slug}-oauth`);
bucket(`${slug}-images`);
if (lib.backups !== false) bucket(`${slug}-backups`);
save();

// Photos are served from images.<host>.
wrangler(
	[
		"r2",
		"bucket",
		"domain",
		"add",
		`${slug}-images`,
		"--domain",
		`images.${values.host}`,
		"--zone-id",
		zone.id,
		"--force",
	],
	{ quiet: true },
);

// 3. Its Workers, after the shared one they bind to.
console.log(`\n━━ ${slug}: Workers`);
if (firstLibrary) deploy(["shared", "metadata"]);
deploy([slug]);

// 4. Its secrets, on the Worker that sends mail and pushes.
console.log(`\n━━ ${slug}: secrets`);
const notify = dry ? "<notify config>" : configFor(data, slug, "notify");
const keyFile = `${root}.keys/${slug}.vapid.json`;
if (dry || existsSync(keyFile)) {
	wrangler(["secret", "put", "VAPID_PRIVATE_JWK", "-c", notify], {
		input: dry ? "" : readFileSync(keyFile, "utf8"),
	});
	console.log(
		`The private push key is in ${keyFile}. Keep a copy somewhere safe: Cloudflare will not show it again.`,
	);
} else console.log(`No ${keyFile}; VAPID_PRIVATE_JWK left as it is.`);
wrangler(["secret", "put", "RESEND_API_KEY", "-c", notify], {
	input: env.RESEND_API_KEY ?? "",
});

// 5. The library itself, and its first admin.
console.log(`\n━━ ${slug}: the library and its first admin`);
const core = dry ? "<core config>" : configFor(data, slug, "core");
const memberId = ulid();
const statements = [
	`INSERT OR IGNORE INTO communities (id, slug, name, centre_lat, centre_lng, radius_m, join_policy, loan_days, type, created_at)
	 SELECT ${sql(ulid())}, ${sql(slug)}, ${sql(values.name)}, ${centre[0]}, ${centre[1]}, ${Number(values.radius)}, 'invite', 21, ${sql(values.type)}, unixepoch()
	 WHERE NOT EXISTS (SELECT 1 FROM communities)`,
	`INSERT OR IGNORE INTO members (id, email, display_name, locale, created_at)
	 VALUES (${sql(memberId)}, ${sql(admin)}, ${sql(admin.split("@")[0])}, 'en', unixepoch())`,
	`INSERT OR IGNORE INTO memberships (member_id, community_id, role, status, joined_at)
	 SELECT m.id, c.id, 'admin', 'active', unixepoch() FROM members m, communities c WHERE m.email = ${sql(admin)}`,
	`UPDATE memberships SET role = 'admin', status = 'active'
	 WHERE member_id = (SELECT id FROM members WHERE email = ${sql(admin)})`,
];
if (
	wrangler([
		"d1",
		"execute",
		`${slug}-core`,
		"--remote",
		"-c",
		core,
		"--command",
		statements.join(";\n"),
	]) === null
)
	fail("Could not make the library or its admin.");

lib.provisioned = true;
save();
console.log(`\n✓ ${values.name} is open at https://${values.host}`);
console.log(`  Sign in there as ${admin}.`);
