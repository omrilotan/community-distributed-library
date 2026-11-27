import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain Node: the Worker answers over bindings a test can fake. The OAuth
// provider imports the runtime's module, which Node does not have.
export default defineConfig({
	resolve: {
		alias: {
			"cloudflare:workers": fileURLToPath(
				new URL("./test/cloudflare-workers.ts", import.meta.url),
			),
		},
	},
	test: {
		include: ["src/**/*.test.ts"],
		server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
	},
});
