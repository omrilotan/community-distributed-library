import { expect, test } from "@playwright/test";
import { forgetFilters } from "./library.ts";

/**
 * The shelves keep their filters: set once, they are there again whenever
 * the reader comes back, until changed on the shelves themselves.
 */
test.describe("the shelves' filters", () => {
	test.afterEach(async ({ request }) => {
		await forgetFilters(request);
	});

	test("come back after leaving, and stay gone once cleared", async ({
		page,
	}) => {
		await page.goto("/");
		await page.locator("details.filters > summary").click();
		await page
			.locator(".chip", { hasText: /Available now|פנויים עכשיו/ })
			.click();
		await expect(page).toHaveURL(/availableOnly=1/);
		// Back from the choice, Filters is folded away.
		await expect(page.locator("details.filters")).not.toHaveAttribute("open");

		// Away and back, the way a reader comes back: a fresh visit.
		await page.goto("/about");
		await page.goto("/");
		await expect(page).toHaveURL(/availableOnly=1/);

		// Taken off on the shelves, it stays off. The panel starts closed.
		await page.locator("details.filters > summary").click();
		await page
			.locator(".chip", { hasText: /Available now|פנויים עכשיו/ })
			.click();
		await expect(page).not.toHaveURL(/availableOnly/);
		await page.goto("/about");
		await page.goto("/");
		await expect(page).not.toHaveURL(/availableOnly/);
	});

	test("are left alone by a search", async ({ page }) => {
		await page.goto("/?sort=title");
		await page.goto("/?q=anything");
		await page.goto("/");
		await expect(page).toHaveURL(/sort=title/);
		// Back to the shelves from the search's own page, as the Browse tab
		// does: that is coming back, not clearing them.
		const search = new URL("/?q=anything", page.url()).toString();
		await page.goto("/", { referer: search });
		await expect(page).toHaveURL(/sort=title/);
	});

	test("follow the member to a device that has never seen them", async ({
		page,
		browser,
	}) => {
		await page.goto("/?sort=title&wished=1");
		await expect(page).toHaveURL(/sort=title/);

		// Same member, fresh browser: the session cookie only, no filters yet.
		const other = await browser.newContext({
			storageState: "e2e/.auth/borrower.json",
		});
		const elsewhere = await other.newPage();
		await elsewhere.goto("/");
		await expect(elsewhere).toHaveURL(/sort=title/);
		await expect(elsewhere).toHaveURL(/wished=1/);
		await other.close();

		// Cleared here, cleared everywhere.
		await page.goto("/");
		await page.locator("details.filters > summary").click();
		await page.locator(".listing-controls a", { hasText: /New|חדשים/ }).click();
		await page
			.locator(".quick-tags a.chip", { hasText: /Want to read|רוצה לקרוא/ })
			.click();
		await expect(page).not.toHaveURL(/sort=|wished=/);
		const again = await browser.newContext({
			storageState: "e2e/.auth/borrower.json",
		});
		const back = await again.newPage();
		await back.goto("/");
		await expect(back).not.toHaveURL(/sort=|wished=/);
		await again.close();
	});
});
