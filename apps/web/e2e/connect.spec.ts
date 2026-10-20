import { expect, test } from "@playwright/test";
import { copied, watchClipboard } from "./clipboard.ts";

/** The address is what everybody comes to /connect for. */
test.describe("connecting an assistant", () => {
	test.use({
		permissions: ["clipboard-write"],
	});

	test("puts the MCP address on the clipboard", async ({ page }) => {
		await watchClipboard(page);
		await page.goto("/connect");
		// The buttons only work once the client islands have hydrated.
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		const first = page.locator(".copyable").first();
		const shown = await first.locator("code").innerText();
		expect(shown).toMatch(/^https?:\/\/.+\/mcp$/);

		await first.locator("button").click();
		await expect(first.locator("button")).toHaveText(/Copied/);

		const clipboard = await copied(page);
		expect(clipboard).toBe(shown);
	});

	test("copies the command too", async ({ page }) => {
		await watchClipboard(page);
		await page.goto("/connect");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		const block = page.locator(".copyable-block").first();
		await block.locator("button").click();
		const clipboard = await copied(page);
		expect(clipboard).toContain("claude mcp add");
	});
});
