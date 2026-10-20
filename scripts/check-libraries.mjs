#!/usr/bin/env node
// Refuses a library whose Workers would reach into another library: each
// library's written configs must name its own Workers, routes, databases,
// buckets, bindings and addresses, and carry no value meant for local
// development. A manifest that gives two libraries one database, or a
// template binding the generator does not know, is caught before a deploy.
import { unstable_readConfig } from "wrangler";
import { SERVICES, SHARED, configFor, manifest, root } from "./libraries.mjs";

export function check(data = manifest()) {
	const problems = [];
	const seen = new Map();
	const claim = (kind, value, owner) => {
		const key = `${kind}:${value}`;
		const other = seen.get(key);
		if (other && other !== owner)
			problems.push(`${owner}: ${kind} ${value} is also ${other}'s`);
		seen.set(key, owner);
	};

	for (const { slug, host } of data.libraries) {
		for (const service of SERVICES) {
			const owner = `${slug}/${service.name}`;
			const say = (message) => problems.push(`${owner}: ${message}`);
			// The template, as local development runs it; and this library's.
			const top = unstable_readConfig(
				{ config: `${root}${service.dir}/wrangler.jsonc` },
				{ hideWarnings: true },
			);
			let config;
			try {
				config = unstable_readConfig(
					{ config: configFor(data, slug, service.name) },
					{ hideWarnings: true },
				);
			} catch (error) {
				say(error.message);
				continue;
			}
			const ours = (value) => value.startsWith(`${slug}-`);

			if (config.name !== `${slug}-${service.name}`)
				say(`Worker is named ${config.name}, not ${slug}-${service.name}`);
			claim("Worker", config.name, slug);

			const routes = config.routes ?? [];
			if (service.host) {
				if (routes.length === 0) say("has no route");
				for (const route of routes) {
					const pattern = typeof route === "string" ? route : route.pattern;
					if (pattern !== host && !pattern.endsWith(`.${host}`))
						say(`route ${pattern} is not under ${host}`);
					claim("route", pattern, slug);
				}
			} else if (routes.length > 0) say("is internal but has a route");

			for (const binding of config.services ?? []) {
				if (!ours(binding.service) && !SHARED.has(binding.service))
					say(`${binding.binding} binds ${binding.service}`);
			}
			for (const database of config.d1_databases ?? []) {
				if (!ours(database.database_name))
					say(`database ${database.database_name}`);
				claim("database", database.database_id, slug);
			}
			for (const bucket of config.r2_buckets ?? []) {
				if (!ours(bucket.bucket_name)) say(`bucket ${bucket.bucket_name}`);
				claim("bucket", bucket.bucket_name, slug);
			}
			for (const namespace of config.kv_namespaces ?? [])
				claim("KV namespace", namespace.id, slug);

			// The same bindings as the top level, by name: wrangler does not copy
			// them into an env block, so one left out is simply missing there.
			const names = (list) => (list ?? []).map((item) => item.binding).sort();
			for (const [kind, key] of [
				["service", "services"],
				["database", "d1_databases"],
				["bucket", "r2_buckets"],
				["KV namespace", "kv_namespaces"],
				["queue", "queues"],
			]) {
				const have = names(
					key === "queues" ? config.queues?.producers : config[key],
				);
				const want = names(key === "queues" ? top.queues?.producers : top[key]);
				for (const binding of want)
					if (!have.includes(binding))
						say(`${kind} binding ${binding} is missing`);
			}
			if (Boolean(top.assets?.binding) !== Boolean(config.assets?.binding))
				say("assets binding is missing");

			// The same vars as the top level, and every address is this library's.
			const want = Object.keys(top.vars ?? {}).sort();
			const have = Object.keys(config.vars ?? {}).sort();
			for (const key of want)
				if (!have.includes(key)) say(`var ${key} is missing`);
			for (const [key, value] of Object.entries(config.vars ?? {})) {
				if (
					typeof value === "string" &&
					(/localhost/.test(value) || (value && value === top.vars?.[key]))
				)
					say(`var ${key} = ${value} is the local development value`);
			}
			for (const key of ["VAPID_PUBLIC_KEY"]) {
				const value = config.vars?.[key];
				if (value) claim(`${service.name} ${key}`, value, slug);
			}

			const crons = config.triggers?.crons ?? [];
			const topCrons = top.triggers?.crons ?? [];
			if (crons.join() !== topCrons.join())
				say(`crons ${crons.join(" ")} differ from ${topCrons.join(" ")}`);
		}
	}
	return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const problems = check();
	if (problems.length) {
		console.error(problems.map((line) => `✗ ${line}`).join("\n"));
		process.exit(1);
	}
	console.log(
		`✓ ${manifest().libraries.length} libraries, each on its own resources`,
	);
}
