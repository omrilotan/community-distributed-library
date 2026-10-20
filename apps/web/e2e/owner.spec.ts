import { expect, test } from "@playwright/test";
import { forgetFilters } from "./library.ts";

/**
 * A small community: seeing a neighbour's other books is half the reason to
 * open a book page at all.
 */
test.describe("another member's shelf", () => {
	// "All books" is the shelves as the member keeps them: start them plain,
	// whatever an earlier file left.
	test.beforeEach(({ request }) => forgetFilters(request));

	test("is one click from a book page", async ({ page }) => {
		await page.goto("/");
		await page.locator("#listing .tile").first().click();

		const link = page.locator('.choose a[href^="/?owner="]').first();
		await expect(link).toBeVisible();
		const who = (await link.innerText()).replace(/^More books from /, "");

		await link.click();
		await expect(page).toHaveURL(/\?owner=/);
		await expect(page.locator("h1")).toContainText(who);
		await expect(page.locator("#listing .tile").first()).toBeVisible();
	});

	test("goes back to everything", async ({ page }) => {
		await page.goto("/");
		const all = await page.locator("#listing .tile").count();
		await page.locator("#listing .tile").first().click();
		await page.locator('.choose a[href^="/?owner="]').first().click();
		// Counted once the shelf is there, not on the page being left.
		await expect(page).toHaveURL(/\?owner=/);
		await expect(page.locator("#listing .tile").first()).toBeVisible();

		const theirs = await page.locator("#listing .tile").count();
		expect(theirs).toBeGreaterThan(0);
		expect(theirs).toBeLessThanOrEqual(all);

		await page.locator(".page-head a[href='/']").click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator("#listing .tile")).toHaveCount(all);
	});
});
