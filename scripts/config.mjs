#!/usr/bin/env node
// Write one library's config for one Worker and print its path, for running
// wrangler by hand against a library:
//
//   npx wrangler d1 execute staging-core --remote \
//     -c "$(node scripts/config.mjs staging core)" --command "SELECT 1"
//   node scripts/config.mjs shared metadata
import { configFor, manifest, sharedConfigFor } from "./libraries.mjs";

const [slug, service] = process.argv.slice(2);
if (!slug || !service) {
	console.error("Usage: node scripts/config.mjs <library|shared> <service>");
	process.exit(2);
}
const data = manifest();
console.log(
	slug === "shared"
		? sharedConfigFor(data, service)
		: configFor(data, slug, service),
);
