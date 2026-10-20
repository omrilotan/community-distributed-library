/**
 * Every worker answers only on the custom domains the zone serves: never on
 * a *.workers.dev address, where the zone's rules and headers do not apply,
 * and never on a preview URL. CI runs this before the tests.
 */
import { globSync, readFileSync } from "node:fs";

const configs = globSync("{apps,services}/*/wrangler.jsonc");
const wrong = configs.filter((path) => {
	const text = readFileSync(path, "utf8");
	return (
		!/"workers_dev":\s*false/.test(text) ||
		!/"preview_urls":\s*false/.test(text) ||
		/"workers_dev":\s*true/.test(text) ||
		/"preview_urls":\s*true/.test(text)
	);
});

if (configs.length === 0) {
	console.error("check-hosts: no wrangler.jsonc found");
	process.exit(1);
}
if (wrong.length) {
	console.error(
		`check-hosts: workers.dev or preview URLs must be off (workers_dev: false, preview_urls: false) in:\n  ${wrong.join("\n  ")}`,
	);
	process.exit(1);
}
console.log(`check-hosts: ${configs.length} workers, custom domains only`);
