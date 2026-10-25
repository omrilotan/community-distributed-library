import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	// Names the build in the edge's copies of public pages (lib/edge-cache.ts),
	// so a deploy never serves a page whose scripts are gone.
	define: { __BUILD_STAMP__: JSON.stringify(Date.now().toString(36)) },
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
