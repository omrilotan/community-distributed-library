import { expect, test, type Page } from "@playwright/test";

const tiles = (page: Page) => page.locator("#listing .tile");

/** The menu's language link gains its `back` parameter on hydration. */
async function hydrated(page: Page) {
	await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
}

test.describe("browsing further down the shelves", () => {
	test("says how many books there are in all", async ({ page }) => {
		await page.goto("/");
		const said = await page.locator(".listing-total").innerText();
		const total = Number(said.match(/\d+/)?.[0]);
		expect(total).toBeGreaterThanOrEqual(await tiles(page).count());
	});

	test("keeps the extra books when you come back from one", async ({
		page,
	}) => {
		await page.goto("/");
		await hydrated(page);
		const first = await tiles(page).count();
		expect(first).toBeGreaterThan(0);

		await page.locator("[data-more]").click();
		await expect(tiles(page)).toHaveCount(first * 2);
		// The address bar has to say what is on screen, or Back cannot restore it.
		await expect(page).toHaveURL(new RegExp(`shown=${first * 2}`));

		const title = await tiles(page)
			.nth(first)
			.locator(".tile-title")
			.innerText();
		await tiles(page).nth(first).click();
		await expect(page.locator("h1")).toContainText(title);

		await page.goBack();
		await expect(tiles(page)).toHaveCount(first * 2);
	});

	test("adds to the list rather than replacing it", async ({ page }) => {
		await page.goto("/");
		await hydrated(page);
		const before = await tiles(page).nth(0).locator(".tile-title").innerText();

		await page.locator("[data-more]").click();
		await expect(tiles(page).nth(0).locator(".tile-title")).toHaveText(before);
		// No duplicates: the fetch asks only for the slice that is missing.
		const titles = await tiles(page).locator(".tile-title").allInnerTexts();
		expect(new Set(titles).size).toBe(titles.length);
	});

	test("works without JavaScript, as a longer page", async ({ browser }) => {
		const context = await browser.newContext({
			javaScriptEnabled: false,
			storageState: "e2e/.auth/borrower.json",
		});
		const page = await context.newPage();
		await page.goto("/");
		const first = await tiles(page).count();
		await page.locator("[data-more]").click();
		await expect(tiles(page)).toHaveCount(first * 2);
		await context.close();
	});
});
