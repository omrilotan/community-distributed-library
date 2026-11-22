import { defineConfig } from "vitest/config";

// Plain Node: the Worker answers over bindings a test can fake.
export default defineConfig({
	test: { include: ["src/**/*.test.ts"] },
});
