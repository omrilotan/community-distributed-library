import { defineConfig } from "vitest/config";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

/** The service itself in workerd, against its own migrated D1. */
export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations("./migrations"),
				},
			},
		})),
	],
	test: {
		include: ["src/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
	},
});
