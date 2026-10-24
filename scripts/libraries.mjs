// The libraries an operator runs, and the Worker configs they deploy with.
//
// The wrangler.jsonc files in the repo describe one library for local
// development (Workers named cdl-*). Each real library's facts (its address,
// databases, push key) live in a manifest, libraries.json by default or the
// file CDL_LIBRARIES names; see libraries.example.json for every field. A deploy writes one
// full config per library and Worker next to the template, from the template
// and the manifest, and deploys that file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { experimental_readRawConfig } from "wrangler";

export const root = new URL("..", import.meta.url).pathname;

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
];
export const SHARED = new Set(["cdl-metadata"]);

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
	for (const lib of data.libraries) {
		if (!/^[a-z][a-z0-9-]*$/.test(lib.slug ?? ""))
			say(`"${lib.slug}" is not a slug`);
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
	for (const key of Object.keys(config))
		if (config[key] === undefined) delete config[key];
	return write(service.dir, slug, config);
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
	return write(service.dir, "shared", config);
}
