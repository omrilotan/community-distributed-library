#!/usr/bin/env node
// Checks what opening a library needs, before anything is made. Usage:
//
//   node scripts/check-setup.mjs [--host our-street.example.org]
//
// Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (optional) from the
// environment and never prints them. Exits non-zero when something is
// missing, each problem on its own line with what to do.
import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { root } from "./libraries.mjs";

const { values } = parseArgs({ options: { host: { type: "string" } } });
const problems = [];
const ok = (line) => console.log(`✓ ${line}`);
const bad = (line) => {
	console.log(`✗ ${line}`);
	problems.push(line);
};

// Node, as the repository pins it.
const wanted = readFileSync(`${root}.nvmrc`, "utf8").trim();
const major = process.versions.node.split(".")[0];
if (major === wanted.replace(/^v/, "").split(".")[0])
	ok(`Node ${process.versions.node}`);
else
	bad(`Node ${process.versions.node}; this project wants ${wanted} (.nvmrc)`);

if (existsSync(`${root}node_modules/wrangler`)) ok("Dependencies installed");
else bad("Dependencies missing: run npm install");

if (existsSync(`${root}.env`)) ok(".env found");
else
	bad(
		".env missing: make it in the repository's folder (docs/self-hosting.md, step 3)",
	);

const token = process.env.CLOUDFLARE_API_TOKEN;
const cf = async (path) => {
	const reply = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	return reply.json().catch(() => ({}));
};

let account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token)
	bad(
		"CLOUDFLARE_API_TOKEN is not set: add it to .env, then run `set -a; . ./.env; set +a`",
	);
else {
	// A user token verifies at /user; an account-owned one does not, but
	// either lists the accounts it reaches.
	const accounts = (await cf("/accounts")).result ?? [];
	const verify = await cf("/user/tokens/verify");
	if (verify.result?.status !== "active" && accounts.length === 0) {
		bad("Cloudflare refuses the token: make a new one (step 2)");
		account = undefined;
	} else {
		ok("Cloudflare token works");
		if (account) {
			if (accounts.some((entry) => entry.id === account))
				ok("CLOUDFLARE_ACCOUNT_ID is one the token reaches");
			else bad("The token does not reach CLOUDFLARE_ACCOUNT_ID");
		} else if (accounts.length === 1) {
			account = accounts[0].id;
			ok(`Cloudflare account: ${accounts[0].name}`);
		} else if (accounts.length === 0)
			bad("The token reaches no account: it needs Account Settings: Read");
		else
			bad(
				`The token reaches ${accounts.length} accounts: set CLOUDFLARE_ACCOUNT_ID in .env to one of ${accounts.map((entry) => `${entry.name} (${entry.id})`).join(", ")}`,
			);
	}

	if (account) {
		const r2 = await cf(`/accounts/${account}/r2/buckets`);
		if (r2.success) ok("R2 storage is on");
		// 10000 is Cloudflare's "Authentication error": a token without the scope.
		else if (r2.errors?.some((error) => error.code === 10000))
			bad(
				"The token cannot reach R2: it needs Workers R2 Storage: Edit (step 2)",
			);
		else
			bad(
				"R2 storage is not on for this account: in Cloudflare, open R2 Object Storage and turn it on",
			);
		const d1 = await cf(`/accounts/${account}/d1/database`);
		if (d1.success) ok("The token can manage D1 databases");
		else bad("The token cannot reach D1: it needs D1: Edit");
	}

	if (values.host && account) {
		const zone = await zoneOf(values.host);
		if (zone?.status === "active") {
			ok(`${zone.name} is on Cloudflare`);
			// Opening the library turns sending on; the token has to be allowed.
			const sending = await cf(`/zones/${zone.id}/email/sending/subdomains`);
			if (sending.success) ok("The token can manage Email Sending");
			else
				bad(
					"The token cannot reach Email Sending: it needs Email Sending: Edit (step 2)",
				);
		} else if (zone)
			bad(
				`${zone.name} is on Cloudflare but ${zone.status}: finish moving its nameservers`,
			);
		else
			bad(
				`No domain in this account holds ${values.host}: add the domain to Cloudflare first, or check the token has Zone: Read`,
			);
	}

	// Libraries already open send through Cloudflare Email Sending, which has
	// to be on for each sender's domain. The manifest is libraries.json or the
	// file CDL_LIBRARIES names, never the example.
	const path = process.env.CDL_LIBRARIES || `${root}libraries.json`;
	const libraries = existsSync(path)
		? (JSON.parse(readFileSync(path, "utf8")).libraries ?? [])
		: [];
	const domains = new Set(
		libraries.map((lib) => lib.address?.split("@")[1]).filter(Boolean),
	);
	for (const domain of account ? domains : []) {
		const zone = await zoneOf(domain);
		const sending = zone
			? await cf(`/zones/${zone.id}/email/sending/subdomains`)
			: {};
		if (
			(sending.result ?? []).some(
				(entry) => entry.name === domain && entry.enabled,
			)
		)
			ok(`Cloudflare sends the libraries' mail from ${domain}`);
		else if (sending.success === false)
			bad(
				"The token cannot reach Email Sending: it needs Email Sending: Edit (step 2)",
			);
		else if (!zone)
			bad(
				`No domain in this account holds ${domain}: add the domain to Cloudflare first, or check the token has Zone: Read`,
			);
		else
			bad(
				`Email Sending is off for ${domain}: run npx wrangler email sending enable ${domain}`,
			);
	}
}

/** The Cloudflare zone a name is in, from its longest match down. */
async function zoneOf(name) {
	const labels = name.split(".");
	for (let at = 0; at < labels.length - 1; at += 1) {
		const zone = (
			await cf(
				`/zones?name=${labels.slice(at).join(".")}&account.id=${account}`,
			)
		).result?.[0];
		if (zone) return zone;
	}
	return null;
}

if (problems.length) {
	console.log(`\n${problems.length} to fix before opening a library.`);
	process.exit(1);
}
console.log("\nReady to open a library.");
