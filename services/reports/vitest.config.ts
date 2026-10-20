import { defineConfig } from "vitest/config";

// Plain Node: the worker is a fetch handler over a binding a test can fake.
export default defineConfig({
	test: { include: ["src/**/*.test.ts"] },
});
