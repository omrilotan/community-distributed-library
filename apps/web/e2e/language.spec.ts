import { expect, test } from "@playwright/test";
import { forgetFilters } from "./library.ts";

/**
 * A link can carry its language: `?lang=he` opens the page in Hebrew and
 * keeps it that way for the pages after, like the menu's switch does.
 */
test.describe("a link with a language", () => {
	test("opens in that language and keeps it", async ({ browser }) => {
		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
		});
		const page = await visitor.newPage();
		await page.goto("/about?lang=he");
		await expect(page.locator("html")).toHaveAttribute("lang", "he");
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

		await page.goto("/about");
		await expect(page.locator("html")).toHaveAttribute("lang", "he");
		await page.goto("/?lang=en");
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
		await visitor.close();
	});

	// The sort set below follows the member everywhere: put back after.
	test.afterEach(({ request }) => forgetFilters(request));

	test("does not touch a member's remembered filters", async ({ page }) => {
		await page.goto("/?sort=title");
		// A bare address with a language brings the filters back, in that language.
		await page.goto("/?lang=he");
		await expect(page).toHaveURL(/sort=title/);
		await expect(page.locator("html")).toHaveAttribute("lang", "he");
		await page.goto("/?lang=en");
		await expect(page).toHaveURL(/sort=title/);
		await expect(page.locator("html")).toHaveAttribute("lang", "en");
	});
});
