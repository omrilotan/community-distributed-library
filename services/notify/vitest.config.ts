import { defineConfig } from "vitest/config";

// Plain Node: push.ts is Web Crypto and fetch, both of which Node provides.
export default defineConfig({
	test: { include: ["src/**/*.test.ts"] },
});
