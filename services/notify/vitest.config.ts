import { defineConfig } from "vitest/config";

// Plain Node: push.ts is Web Crypto and fetch, both of which Node provides;
// the Worker's entrypoint class is stubbed.
export default defineConfig({
	resolve: {
		alias: {
			"cloudflare:workers": new URL("./src/workers-stub.ts", import.meta.url)
				.pathname,
		},
	},
	test: { include: ["src/**/*.test.ts"] },
});
