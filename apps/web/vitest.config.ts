import { defineConfig } from "vitest/config";

// Pure modules only (crop geometry, i18n). UI is checked in the browser.
export default defineConfig({
	test: { include: ["lib/**/*.test.ts"] },
});
