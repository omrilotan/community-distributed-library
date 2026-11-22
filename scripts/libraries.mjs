// The libraries an operator runs, and the Worker configs they deploy with.
//
// The wrangler.jsonc files in the repo describe one library for local
// development (Workers named cdl-*). Each real library's facts (its address,
// databases, push key) live in a manifest, libraries.json by default or the
// file CDL_LIBRARIES names; see libraries.example.json for every field. A deploy writes one
// full config per library and Worker next to the template, from the template
// and the manifest, and deploys that file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { experimental_readRawConfig } from "wrangler";

export const root = fileURLToPath(new URL("..", import.meta.url));

// Node will not spawn a .cmd without a shell (EINVAL since 20.12), so on
// Windows run npx's own script under this same node: the command and its
// leading arguments, to spread into spawn.
const npmBin = process.env.npm_execpath
	? dirname(process.env.npm_execpath)
	: join(dirname(process.execPath), "node_modules", "npm", "bin");
export const npx =
	process.platform === "win32"
		? [process.execPath, join(npmBin, "npx-cli.js")]
		: ["npx"];

// Deploy order: a Worker's service bindings must point at Workers that
// already exist, so the ones bound to come first. `host` is the public
// address a Worker answers on, if it has one.
export const SERVICES = [
	{ name: "notify", dir: "services/notify" },
	{ name: "convo", dir: "services/convo", database: true },
	{ name: "core", dir: "services/core", database: true },
	{ name: "mcp", dir: "services/mcp", host: (lib) => `mcp.${lib.host}` },
	{ name: "web", dir: "apps/web", host: (lib) => lib.host },
];

// Workers every library shares: bound to, never copied.
export const SHARED_SERVICES = [
	{ name: "metadata", dir: "services/metadata", database: true },
	{ name: "reports", dir: "services/reports" },
	{ name: "landing", dir: "apps/landing" },
	// The operator's MCP (services/ops); only once scripts/ops.mjs set it up.
	{ name: "ops", dir: "services/ops", database: true, optional: true },
];
export const SHARED = new Set(["cdl-metadata"]);

// How much of each Worker's traffic Cloudflare keeps: the share of requests
// whose logs and traces are stored (head sampling, decided before the
// outcome is known). Workers whose logs carry the errors and the delivery
// steps keep every request; those that mostly serve static files or cache
// hits keep a share. The manifest can change any of them, for the whole
// fleet (`sampling`) or for one library (`libraries[].sampling`), as
// `{ "<worker>": { "logs": 0.5, "traces": 0.1 } }`. See
// docs/observability-plan.md, section 1.6.
export const SAMPLING = {
	notify: { logs: 1, traces: 1 },
	convo: { logs: 1, traces: 0.25 },
	core: { logs: 1, traces: 0.25 },
	mcp: { logs: 1, traces: 1 },
	web: { logs: 0.25, traces: 0.05 },
	metadata: { logs: 0.25, traces: 0.05 },
	reports: { logs: 0.1, traces: 0 },
	landing: { logs: 0.1, traces: 0 },
	ops: { logs: 1, traces: 1 },
};

/** A Worker's rates: the default, then the fleet's, then the library's. */
export function sampling(name, data, lib) {
	return {
		...SAMPLING[name],
		...data.sampling?.[name],
		...lib?.sampling?.[name],
	};
}

/** The template's observability block with this Worker's rates in it. */
function observability(config, rates) {
	const block = structuredClone(config.observability ?? { enabled: true });
	block.logs = { ...block.logs, head_sampling_rate: rates.logs };
	block.traces = {
		...block.traces,
		enabled: rates.traces > 0,
		head_sampling_rate: rates.traces,
	};
	return block;
}

/** Every rate the manifest sets names a Worker and is a share from 0 to 1. */
function checkSampling(where, value, say) {
	if (value === undefined) return;
	const workers = Object.keys(SAMPLING);
	for (const [name, rates] of Object.entries(value ?? {})) {
		if (!workers.includes(name))
			say(`${where}.${name} is not a Worker (${workers.join(", ")})`);
		for (const [kind, rate] of Object.entries(rates ?? {})) {
			// core also samples its own counts of ordinary reads (cdl_events).
			if (
				kind !== "logs" &&
				kind !== "traces" &&
				!(kind === "reads" && name === "core")
			)
				say(`${where}.${name}.${kind} must be logs or traces`);
			if (typeof rate !== "number" || rate < 0 || rate > 1)
				say(`${where}.${name}.${kind} must be a number from 0 to 1`);
		}
	}
}

/** The vars each Worker of a library gets, from the manifest. */
function vars(service, lib, data) {
	const app = `https://${lib.host}`;
	const images = `https://images.${lib.host}`;
	const mcp = `https://mcp.${lib.host}`;
	return {
		notify: {
			FROM_ADDRESS: lib.address,
			VAPID_PUBLIC_KEY: lib.vapidPublicKey,
			FROM_NAME: lib.fromName,
		},
		convo: {},
		core: {
			APP_URL: app,
			VAPID_PUBLIC_KEY: lib.vapidPublicKey,
			COVERS_PUBLIC_URL: images,
			CONTACT_ADDRESS: lib.address,
			// cdl_events (services/core/src/telemetry.ts): who, since when,
			// and how much of the ordinary reads to count.
			LIBRARY: lib.slug,
			DEPLOYED_AT: String(Date.now()),
			READS_SAMPLE_RATE: String(sampling("core", data, lib).reads ?? ""),
			SAMPLING_BOOST_UNTIL: lib.samplingBoostUntil ?? "",
		},
		mcp: { APP_URL: app, SELF_URL: mcp },
		web: {
			MCP_URL: mcp,
			FROM_ADDRESS: lib.address,
			APP_URL: app,
			IMAGES_URL: images,
			REPORTS_URL: data.shared?.reports?.host
				? `https://${data.shared.reports.host}`
				: "",
		},
	}[service];
}

/** CDL_LIBRARIES, else libraries.json, else the example (CI, a fresh clone). */
export function manifestPath() {
	if (process.env.CDL_LIBRARIES) return process.env.CDL_LIBRARIES;
	const own = join(root, "libraries.json");
	return existsSync(own) ? own : join(root, "libraries.example.json");
}

export function manifest(path = manifestPath()) {
	if (!existsSync(path))
		throw new Error(
			`No manifest at ${path}. Copy libraries.example.json to libraries.json, or set CDL_LIBRARIES.`,
		);
	const data = JSON.parse(readFileSync(path, "utf8"));
	const say = (message) => {
		throw new Error(`${path}: ${message}`);
	};
	if (!data.accountId) say("accountId is missing");
	if (!Array.isArray(data.libraries) || data.libraries.length === 0)
		say("lists no libraries");
	checkSampling("sampling", data.sampling, say);
	// Where alerts go (scripts/observe.mjs); optional until alerts are set up.
	if (
		data.alerts?.email !== undefined &&
		!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.alerts.email)
	)
		say(`alerts.email "${data.alerts.email}" is not an email address`);
	for (const lib of data.libraries) {
		if (!/^[a-z][a-z0-9-]*$/.test(lib.slug ?? ""))
			say(`"${lib.slug}" is not a slug`);
		checkSampling(`${lib.slug}: sampling`, lib.sampling, say);
		for (const key of [
			"host",
			"address",
			"fromName",
			"vapidPublicKey",
			"oauthKv",
		])
			if (!lib[key]) say(`${lib.slug}: ${key} is missing`);
		for (const service of SERVICES.filter((entry) => entry.database))
			if (!lib.databases?.[service.name])
				say(`${lib.slug}: databases.${service.name} is missing`);
	}
	return data;
}

export function library(data, slug) {
	const found = data.libraries.find((entry) => entry.slug === slug);
	if (!found)
		throw new Error(
			`No library "${slug}". Known: ${data.libraries.map((entry) => entry.slug).join(", ")}`,
		);
	return found;
}

function template(dir) {
	const { rawConfig } = experimental_readRawConfig({
		config: join(root, dir, "wrangler.jsonc"),
	});
	const config = structuredClone(rawConfig);
	delete config.env;
	return config;
}

/** Writes next to the template, so its relative paths still hold. */
function write(dir, label, config) {
	const path = join(root, dir, `wrangler.${label}.json`);
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
	return path;
}

/** One library's config for one of its Workers; returns the file's path. */
export function configFor(data, slug, name) {
	const lib = library(data, slug);
	const service = SERVICES.find((entry) => entry.name === name);
	if (!service) throw new Error(`No service "${name}"`);
	const config = template(service.dir);
	const ours = (value) => value.replace(/^cdl-/, `${slug}-`);

	config.name = `${slug}-${name}`;
	config.account_id = data.accountId;
	if (service.host)
		config.routes = [{ pattern: service.host(lib), custom_domain: true }];
	else delete config.routes;
	config.d1_databases = config.d1_databases?.map((database) => ({
		...database,
		database_name: `${slug}-${name}`,
		database_id: lib.databases[name],
	}));
	config.r2_buckets = config.r2_buckets
		// No nightly snapshot for a library that opted out: core skips it
		// without the bucket (services/core/src/backup.ts).
		?.filter((bucket) => bucket.binding !== "BACKUPS" || lib.backups !== false)
		.map((bucket) => ({
			...bucket,
			bucket_name: ours(bucket.bucket_name),
		}));
	config.services = config.services?.map((binding) =>
		SHARED.has(binding.service)
			? binding
			: { ...binding, service: ours(binding.service) },
	);
	config.kv_namespaces = config.kv_namespaces?.map((namespace) =>
		namespace.binding === "OAUTH_KV"
			? { ...namespace, id: lib.oauthKv }
			: namespace,
	);
	// Every var the template has must come from the manifest: a value meant
	// for local development never reaches a library.
	const wanted = vars(name, lib, data);
	for (const key of Object.keys(config.vars ?? {}))
		if (!(key in wanted))
			throw new Error(`${name}: var ${key} has no value for ${slug}`);
	if (Object.keys(wanted).length) config.vars = wanted;
	config.observability = observability(config, sampling(name, data, lib));
	for (const key of Object.keys(config))
		if (config[key] === undefined) delete config[key];
	return write(service.dir, slug, config);
}

/** A binding name for a library's core, as the ops Worker calls it. */
export const opsBinding = (slug) =>
	`LIBRARY_${slug.replace(/-/g, "_").toUpperCase()}`;

/**
 * The ops Worker reaches each library's core through its Internal
 * entrypoint (services/core/src/ops.ts), never the public API.
 */
function opsConfig(config, data) {
	config.services = data.libraries.map((lib) => ({
		binding: opsBinding(lib.slug),
		service: `${lib.slug}-core`,
		entrypoint: "Internal",
	}));
	config.vars = {
		...config.vars,
		LIBRARIES: JSON.stringify(
			data.libraries.map((lib) => ({
				slug: lib.slug,
				host: lib.host,
				binding: opsBinding(lib.slug),
				sampling: Object.fromEntries(
					Object.keys(SAMPLING).map((worker) => [
						worker,
						sampling(worker, data, lib),
					]),
				),
			})),
		),
		FROM_ADDRESS: data.libraries[0].address,
		// The operator (scripts/observe.mjs --email), told of every failure.
		ALERTS_EMAIL: data.alerts?.email ?? "",
	};
}

/** A shared Worker's config; returns the file's path. */
export function sharedConfigFor(data, name) {
	const service = SHARED_SERVICES.find((entry) => entry.name === name);
	if (!service) throw new Error(`No shared service "${name}"`);
	const shared = data.shared?.[name] ?? {};
	const config = template(service.dir);
	config.account_id = data.accountId;
	if (service.database) {
		if (!shared.databaseId)
			throw new Error(`shared.${name}.databaseId is missing`);
		config.d1_databases = config.d1_databases.map((database) => ({
			...database,
			database_id: shared.databaseId,
		}));
	}
	if (shared.host)
		config.routes = [
			{
				pattern: shared.host,
				...(shared.zone ? { zone_name: shared.zone } : {}),
				custom_domain: true,
			},
		];
	if (name === "ops") opsConfig(config, data);
	config.observability = observability(config, sampling(name, data));
	return write(service.dir, "shared", config);
}
