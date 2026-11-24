import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { readdirSync } from "node:fs";

export default defineConfig({
	// Names the build in the edge's copies of public pages (lib/edge-cache.ts),
	// so a deploy never serves a page whose scripts are gone.
	// The app's top-level routes, so the Worker answers any other address with
	// its 404 page from memory (lib/not-found-page.ts).
	define: {
		__BUILD_STAMP__: JSON.stringify(Date.now().toString(36)),
		__APP_ROUTES__: JSON.stringify(
			readdirSync(new URL("./app", import.meta.url), { withFileTypes: true })
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name),
		),
	},
	// Where the docs, the API's APP_URL and Playwright expect the app; vinext
	// stopped choosing it in 1.3. Taken or not at all, never a nearby port.
	server: { port: 3000, strictPort: true },
	plugins: [
		vinext(),
		cloudflare({
			// A deploy builds with one library's written config
			// (scripts/deploy.mjs); development uses wrangler.jsonc.
			configPath: process.env.CDL_WRANGLER_CONFIG,
			viteEnvironment: {
				name: "rsc",
				childEnvironments: ["ssr"],
			},
		}),
	],
});
