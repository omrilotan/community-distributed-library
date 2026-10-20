import { defineConfig } from "vitest/config";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

/** A 1x1 PNG, base64: the smallest thing that passes the cover sniff test. */
const PIXEL_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";

/**
 * Route tests run the real worker in workerd against a migrated D1. The
 * sibling services (metadata, notify, convo) are stubbed in test/stubs.mjs so
 * a test never sends email or calls a book provider.
 */
export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				// No real network from tests: `hooks.ok` accepts, `covers.ok` serves
				// a one-pixel PNG so cover fetching can be exercised, anything
				// else fails.
				outboundService: (request) => {
					const host = new URL(request.url).hostname;
					if (host === "covers.ok") {
						return new Response(
							Uint8Array.from(atob(PIXEL_PNG), (c) => c.charCodeAt(0)),
							{ headers: { "content-type": "image/png" } },
						);
					}
					return new Response(null, {
						status: host === "hooks.ok" ? 200 : 503,
					});
				},
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations("./migrations"),
					DEV_AUTH: "true",
					APP_URL: "http://app.test",
					COVERS_PUBLIC_URL: "http://covers.test",
				},
				workers: ["cdl-metadata", "cdl-notify", "cdl-convo"].map((name) => ({
					name,
					modules: true,
					scriptPath: "./test/stubs.mjs",
					compatibilityDate: "2025-09-01",
					compatibilityFlags: ["nodejs_compat"],
				})),
			},
		})),
	],
	test: {
		include: ["src/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
