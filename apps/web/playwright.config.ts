import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests, for the things only a browser can answer: what overlaps
 * what. Everything else is covered by the route tests in services/core.
 */
export default defineConfig({
	testDir: "./e2e",
	globalSetup: "./e2e/setup.ts",
	fullyParallel: false,
	workers: 1,
	// In CI the HTML report is what gets uploaded on failure, traces inside it.
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	// The dev servers compile a route the first time it is asked for, and a
	// CI runner is slow at it: the first page of a run can take a while.
	expect: { timeout: process.env.CI ? 15_000 : 5_000 },
	// The runner's dev stack drops a connection now and then; one more go,
	// with the trace kept, tells a flake from a fault.
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: process.env.WEB_URL ?? "http://localhost:3000",
		trace: "retain-on-failure",
	},
	projects: [
		{ name: "setup", testMatch: /auth\.setup\.ts/ },
		// The bug this suite exists for only happens where the tab bar does,
		// but the desktop run proves the fix did not move it somewhere else.
		{
			name: "phone",
			use: { ...devices["Pixel 7"], storageState: "e2e/.auth/borrower.json" },
			dependencies: ["setup"],
			testIgnore: /things\.spec\.ts/,
		},
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				storageState: "e2e/.auth/borrower.json",
			},
			dependencies: ["setup"],
			testIgnore: /things\.spec\.ts/,
		},
		// The same library, switched to lending things, after everything else:
		// while it runs every page speaks of things.
		{
			name: "things",
			testMatch: /things\.spec\.ts/,
			use: { ...devices["Pixel 7"], storageState: "e2e/.auth/borrower.json" },
			dependencies: ["phone", "desktop"],
		},
	],
	webServer: {
		command: "npm run dev",
		cwd: "../..",
		url: process.env.WEB_URL ?? "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: "ignore",
		stderr: "pipe",
	},
});
