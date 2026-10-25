import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Plain Node: push.ts is Web Crypto and fetch, both of which Node provides;
// the Worker's entrypoint class is stubbed.
export default defineConfig({
	resolve: {
		alias: {
			"cloudflare:workers": fileURLToPath(
				new URL("./src/workers-stub.ts", import.meta.url),
			),
		},
	},
	test: { include: ["src/**/*.test.ts"] },
});
