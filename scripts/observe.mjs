#!/usr/bin/env node
// Set up who hears about trouble, for every library in the manifest: each
// library's admins get an email when one of its Workers fails; every admin
// gets one when a shared Worker fails or a certificate has a problem; and the
// requests that matter most are traced in full; and GitHub is told which
// hosts to probe from outside (.github/workflows/probe.yml). Usage:
//
//   node scripts/observe.mjs [--email <address>] [--dry-run]
//
// Run it again whenever a library or an admin is added or removed: everything
// is found by name and kept, changed or added, never duplicated. Rules and
// alerts this script did not make are left as they are.
//
// Needs CLOUDFLARE_API_TOKEN with Notifications: Edit, Workers Observability:
// Edit and Zone Observability: Edit (docs/self-hosting.md, step 2), and reads
// each library's admins from its database. The manifest's owner
// (`owner.email`), or else `alerts.email` (set with --email), is told about
// every library as well, for an operator who is not an admin. Addresses are
// never printed.
// See docs/observability-plan.md for what each alert is for.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import {
	SERVICES,
	SHARED_SERVICES,
	configFor,
	manifest,
	manifestPath,
	npx,
	operatorEmail,
	root,
} from "./libraries.mjs";

/** What every name this script gives starts with, so a rerun finds its own. */
const MARK = "CDL: ";

/** The header that asks for a full trace of one request (see traceRules). */
export const TRACE_HEADER = "x-cdl-trace";

/** Cloudflare allows 50 Issues automations in an account. */
const AUTOMATION_LIMIT = 50;

/** Cloudflare sends one alert to at most 20 addresses. */
const RECIPIENT_LIMIT = 20;

/**
 * The Workers whose failures send an alert, each with the library it
 * belongs to: every library's own, then the shared ones (slug null).
 */
export function workers(data) {
	const shared = SHARED_SERVICES.filter(
		(service) =>
			(service.name !== "reports" || data.shared?.reports?.host) &&
			(!service.optional || data.shared?.[service.name]?.databaseId),
	).map((service) => ({ worker: `cdl-${service.name}`, slug: null }));
	return [
		...data.libraries.flatMap((lib) =>
			SERVICES.map((service) => ({
				worker: `${lib.slug}-${service.name}`,
				slug: lib.slug,
			})),
		),
		...shared,
	];
}

/** Addresses once each, in lower case, no more than Cloudflare takes. */
export function recipients(emails) {
	return [...new Set(emails.map((email) => email.trim().toLowerCase()))].slice(
		0,
		RECIPIENT_LIMIT,
	);
}

/** "2 people", without printing anybody's address. */
const count = (emails) =>
	`${emails.length} ${emails.length === 1 ? "person" : "people"}`;

/**
 * A library's active admins, read from its own database; null when the
 * database cannot be read. Run again after an admin changes.
 */
function admins(data, slug) {
	const result = spawnSync(
		npx[0],
		[
			...npx.slice(1),
			"wrangler",
			"d1",
			"execute",
			`${slug}-core`,
			"--remote",
			"--json",
			"-c",
			configFor(data, slug, "core"),
			"--command",
			"SELECT m.email FROM members m JOIN memberships ms ON ms.member_id = m.id WHERE ms.role = 'admin' AND ms.status = 'active'",
		],
		{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
	);
	if (result.status !== 0) return null;
	try {
		return JSON.parse(result.stdout)
			.flatMap((statement) => statement.results ?? [])
			.map((row) => row.email)
			.filter(Boolean);
	} catch {
		return null;
	}
}

/**
 * The trace rules for one library: every request that signs someone in,
 * lets someone join, connects an assistant, or changes a loan or a handoff
 * is traced in full, whatever the zone's default. Rules language:
 * https://developers.cloudflare.com/ruleset-engine/rules-language/
 */
export function libraryRules(lib) {
	const host = JSON.stringify(lib.host);
	const starts = (prefixes) =>
		prefixes
			.map((prefix) => `starts_with(http.request.uri.path, "${prefix}")`)
			.join(" or ");
	const rule = (description, expression) => ({
		description: `${MARK}${lib.slug}: ${description}`,
		expression,
		action: "set_trace_settings",
		action_parameters: { sampling_ratio: 1 },
		enabled: true,
	});
	return [
		rule(
			"signing in, joining and connecting",
			`http.host eq ${host} and (${starts(["/login", "/auth", "/join", "/oauth", "/api/v1/auth"])})`,
		),
		rule(
			"changes to loans and handoffs",
			`http.host eq ${host} and not http.request.method in {"GET" "HEAD"} and (${starts(["/loans", "/api/v1/loans", "/api/v1/handoffs"])})`,
		),
		rule(
			"assistants signing in",
			`http.host eq ${JSON.stringify(`mcp.${lib.host}`)} and http.request.uri.path in {"/authorize" "/token" "/register"}`,
		),
	];
}

/** Any request carrying the operator's trace key, on any host in the zone. */
export function keyRule(key) {
	return {
		description: `${MARK}requests that ask for a trace`,
		expression: `any(http.request.headers[${JSON.stringify(TRACE_HEADER)}][*] eq ${JSON.stringify(key)})`,
		action: "set_trace_settings",
		action_parameters: { sampling_ratio: 1 },
		enabled: true,
	};
}

/** The zone's rules with ours replaced: ours first, everybody else's after, in their order. */
export function mergeRules(existing, ours) {
	const theirs = existing.filter((rule) => !rule.description?.startsWith(MARK));
	return [...ours, ...theirs];
}

// ── Running it ──────────────────────────────────────────────────────────

async function main() {
	const { values } = parseArgs({
		options: {
			email: { type: "string" },
			"dry-run": { type: "boolean", default: false },
		},
	});
	const dry = values["dry-run"];
	const fail = (message) => {
		console.error(`✗ ${message}`);
		process.exit(1);
	};
	const token = process.env.CLOUDFLARE_API_TOKEN;
	if (!token && !dry) fail("CLOUDFLARE_API_TOKEN is not set.");

	const path = manifestPath();
	if (path.endsWith("libraries.example.json") && !dry)
		fail("No libraries.json: open a library first (npm run provision).");
	const data = manifest(path);
	if (values.email) {
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email))
			fail(`--email ${values.email} is not an email address.`);
		data.alerts = { ...data.alerts, email: values.email.trim().toLowerCase() };
		if (!dry) writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
	}

	const account = data.accountId;
	const base = "https://api.cloudflare.com/client/v4";
	/** One API call; returns the result, or fails with what Cloudflare said. */
	async function api(method, route, body) {
		const write = method !== "GET";
		if (dry && write) {
			console.log(`  would ${method} ${route}`);
			return {};
		}
		if (dry && !token) return undefined;
		const reply = await fetch(`${base}${route}`, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(body ? { "content-type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		const json = await reply.json().catch(() => ({}));
		if (!reply.ok || json.success === false) {
			// Most routes answer with errors; some answer a validation error
			// (Zod's issues) instead.
			const said = [
				...(json.errors ?? []).map(
					(error) => `${error.code}: ${error.message}`,
				),
				...(json._c?.issues ?? []).map((issue) => issue.message),
			].join("; ");
			const denied =
				reply.status === 403 || /auth/i.test(said)
					? " The token needs Notifications: Edit, Workers Observability: Edit and Zone Observability: Edit (docs/self-hosting.md, step 2)."
					: "";
			throw new Error(`${method} ${route}: ${said || reply.status}.${denied}`);
		}
		return json.result;
	}

	// 1. Who hears: each library's admins hear about their own library; every
	// admin, of any library, hears about what the libraries share. The
	// manifest's owner (or alerts.email), if any, hears about everything.
	console.log("\n━━ Who is told");
	const operator = operatorEmail(data) ? [operatorEmail(data)] : [];
	const told = new Map();
	for (const lib of data.libraries) {
		const found = dry && !token ? [] : admins(data, lib.slug);
		if (found === null)
			console.log(
				`! ${lib.slug}: could not read its admins; only the owner is told for now.`,
			);
		told.set(lib.slug, recipients([...operator, ...(found ?? [])]));
		console.log(`✓ ${lib.slug}: ${count(told.get(lib.slug))}`);
	}
	const everyone = recipients([...operator, ...[...told.values()].flat()]);
	console.log(`✓ shared Workers and certificates: ${count(everyone)}`);
	if (!everyone.length && !(dry && !token))
		fail(
			"Nobody to tell: no library has an active admin. Give one a role (make-admin), or run again with --email <address>.",
		);

	// 2. Alert policies: where an alert goes. Found by name, so a rerun brings
	// the recipients up to date.
	console.log("\n━━ Alerts");
	// The ops MCP's inbox (scripts/ops.mjs), if it is set up: every alert is
	// posted there too, so the ops tools can say what fired this week.
	let webhook = null;
	const alertsKey = `${root}.keys/alerts.key`;
	if (data.shared?.ops?.host && existsSync(alertsKey)) {
		const route = `/accounts/${account}/alerting/v3/destinations/webhooks`;
		const hooks = (await api("GET", route)) ?? [];
		const body = {
			name: `${MARK}ops`,
			url: `https://${data.shared.ops.host}/alerts`,
			secret: readFileSync(alertsKey, "utf8").trim(),
		};
		const found = hooks.find((entry) => entry.name === body.name);
		if (found) await api("PUT", `${route}/${found.id}`, body);
		webhook = found?.id ?? (await api("POST", route, body))?.id ?? null;
		if (webhook) console.log(`✓ Alerts also go to ${body.url}`);
	}
	const policies =
		(await api("GET", `/accounts/${account}/alerting/v3/policies`)) ?? [];
	// A failure (an Issue) goes to the ops inbox only, when there is one: ops
	// drops scanners' probes and emails the rest (services/ops/src/relay.ts),
	// as Cloudflare cannot filter Issues by type. Without ops, Cloudflare
	// emails every failure itself.
	async function policy(
		name,
		alertType,
		description,
		emails,
		{ relayed } = {},
	) {
		const viaOps = Boolean(relayed && webhook);
		const body = {
			name: `${MARK}${name}`,
			description,
			alert_type: alertType,
			enabled: true,
			filters: {},
			mechanisms: {
				...(viaOps ? {} : { email: emails.map((id) => ({ id })) }),
				...(webhook ? { webhooks: [{ id: webhook }] } : {}),
			},
		};
		const found = policies.find((entry) => entry.name === body.name);
		if (!emails.length && !viaOps) {
			console.log(`! ${body.name}: nobody to tell, left as it is`);
			return found?.id;
		}
		if (found)
			await api(
				"PUT",
				`/accounts/${account}/alerting/v3/policies/${found.id}`,
				body,
			);
		const made = found
			? found
			: await api("POST", `/accounts/${account}/alerting/v3/policies`, body);
		console.log(
			`✓ ${body.name}${found ? "" : " (new)"}, ${viaOps ? "emailed by ops" : "to"} ${count(emails)}`,
		);
		return made?.id ?? `<${name}>`;
	}
	const failing = new Map();
	for (const lib of data.libraries)
		failing.set(
			lib.slug,
			await policy(
				`${lib.slug}: a Worker is failing`,
				"workers_observability_real_time_issue",
				`One of ${lib.host}'s Workers threw, failed, answered 5xx or logged an error. The email links to the issue.`,
				told.get(lib.slug),
				{ relayed: true },
			),
		);
	failing.set(
		null,
		await policy(
			"a shared Worker is failing",
			"workers_observability_real_time_issue",
			"The book lookup, the error reports or the front page threw, failed, answered 5xx or logged an error.",
			everyone,
			{ relayed: true },
		),
	);
	await policy(
		"a certificate needs attention",
		"universal_ssl_event_type",
		"A library's address may stop working over HTTPS.",
		everyone,
	);

	// 3. Issues automations: which Workers' failures go to which policy.
	console.log("\n━━ Failures that send an alert");
	const route = `/accounts/${account}/workers/observability/issues/automations`;
	const automations = (await api("GET", route))?.automations ?? [];
	const wanted = workers(data);
	const missing = wanted.filter(
		({ worker }) => !automations.some((entry) => entry.service === worker),
	);
	if (automations.length + missing.length > AUTOMATION_LIMIT)
		fail(
			`Cloudflare allows ${AUTOMATION_LIMIT} Issues automations in an account; these libraries need ${automations.length + missing.length}.`,
		);
	for (const { worker, slug } of wanted) {
		const policyId = failing.get(slug);
		if (!policyId) continue;
		const body = {
			name: `${MARK}${worker}`,
			policyId,
			service: worker,
			// The first time a failure happens. Cloudflare takes this or a
			// quiet spell (afterInactivitySeconds), never both.
			afterOccurrences: 1,
			enabled: true,
		};
		const found = automations.find((entry) => entry.service === worker);
		if (found) await api("PUT", `${route}/${found.id}`, body);
		else await api("POST", route, body);
		console.log(`✓ ${worker}${found ? "" : " (new)"}`);
	}
	const names = wanted.map(({ worker }) => worker);
	for (const entry of automations.filter(
		(entry) => entry.name?.startsWith(MARK) && !names.includes(entry.service),
	))
		console.log(
			`! ${entry.name} is for a Worker no library has now. Remove it in the dashboard if it is gone.`,
		);

	// 4. Trace rules, per zone: the requests that matter are always traced,
	// and so is any request that carries the operator's trace key.
	console.log("\n━━ Requests that are always traced");
	const keyFile = `${root}.keys/trace.key`;
	let key = existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "";
	if (!key) {
		key = randomBytes(18).toString("base64url");
		if (!dry) {
			mkdirSync(`${root}.keys`, { recursive: true });
			writeFileSync(keyFile, key, { mode: 0o600 });
		}
	}
	const zones = new Map();
	async function zoneOf(host) {
		const labels = host.split(".");
		for (let at = 0; at < labels.length - 1; at += 1) {
			const name = labels.slice(at).join(".");
			if (zones.has(name)) return name;
			const found = await api(
				"GET",
				`/zones?name=${name}&account.id=${account}`,
			);
			if (found?.[0]?.id) {
				zones.set(name, { id: found[0].id, rules: [] });
				return name;
			}
		}
		if (dry && !token) {
			const guess = labels.slice(-2).join(".");
			if (!zones.has(guess)) zones.set(guess, { id: `<${guess}>`, rules: [] });
			return guess;
		}
		fail(`No zone in this account holds ${host}.`);
	}
	for (const lib of data.libraries)
		zones.get(await zoneOf(lib.host)).rules.push(...libraryRules(lib));
	for (const [name, zone] of zones) {
		const route = `/zones/${zone.id}/observability/tracing`;
		const settings = await api("GET", `${route}/settings`);
		// Tracing off: turn it on, tracing nothing by default, so only the
		// rules below decide. Already on: its default is somebody's choice.
		if (settings && !settings.enabled) {
			await api("PATCH", `${route}/settings`, {
				enabled: true,
				sampling_ratio: 0,
			});
			console.log(`✓ ${name}: tracing on, for the requests below only`);
		}
		const existing = (await api("GET", `${route}/rules`))?.rules ?? [];
		const rules = mergeRules(existing, [...zone.rules, keyRule(key)]);
		await api("PUT", `${route}/rules`, { rules });
		console.log(`✓ ${name}: ${zone.rules.length + 1} rules`);
	}
	console.log(
		`\nTo trace one request in full, send the header ${TRACE_HEADER} with the key in ${keyFile}.`,
	);

	// 5. The outside probe (.github/workflows/probe.yml) reads the hosts from
	// a repository variable, since the manifest is not in git. Optional: it
	// needs the GitHub CLI, signed in to this repository's fork.
	console.log("\n━━ The outside probe");
	const hosts = data.libraries.map((lib) => lib.host).join(",");
	if (dry) console.log(`  would set CDL_LIBRARY_HOSTS to ${hosts}`);
	else {
		const set = spawnSync(
			"gh",
			["variable", "set", "CDL_LIBRARY_HOSTS", "--body", hosts],
			{ cwd: root, encoding: "utf8" },
		);
		if (set.status === 0)
			console.log(
				`✓ GitHub probes ${data.libraries.length} libraries every 15 minutes`,
			);
		else
			console.log(
				"! The outside probe is not set up: install the GitHub CLI (gh), run gh auth login, then npm run observe again. Or set the repository variable CDL_LIBRARY_HOSTS to the libraries' hosts.",
			);
	}
	console.log("✓ Alerts and traces are set up.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(`✗ ${error.message}`);
		process.exit(1);
	});
}
