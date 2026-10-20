import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	// Names the build in the edge's copies of public pages (lib/edge-cache.ts),
	// so a deploy never serves a page whose scripts are gone.
	define: { __BUILD_STAMP__: JSON.stringify(Date.now().toString(36)) },
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
