import { expect, test, type Page } from "@playwright/test";

/**
 * The menu renders on the server and then decides things in an effect, so a
 * check that runs too early sees the server's version. The language link
 * gains its `back` parameter on hydration, which makes a reliable signal.
 */
async function openMenu(page: Page) {
	await page.locator(".menu > summary").click();
	await expect(page.locator('.menu-panel a[href*="back="]')).toBeVisible();
}

/**
 * The install option only exists where it can do something, which makes it
 * easy to wire up wrongly and never notice: the browser decides, and a
 * developer's browser usually says no.
 */
test.describe("the menu", () => {
	test("offers the home screen when the browser says the app can be installed", async ({
		page,
	}) => {
		// Stand in for Chrome's offer, which it makes before the page scripts run.
		await page.addInitScript(() => {
			(window as { __installPrompt?: unknown }).__installPrompt = {
				prompt: () => Promise.resolve(),
			};
		});
		await page.goto("/");
		await openMenu(page);

		const install = page.locator(".menu-panel button", {
			hasText: /home screen|מסך הבית/,
		});
		await expect(install).toBeVisible();
		await install.click();
		// Taking the offer consumes it, so it stops being on the menu.
		await expect(install).toHaveCount(0);
	});

	test("says nothing about installing when the browser has not offered", async ({
		page,
	}) => {
		await page.goto("/");
		await openMenu(page);
		await expect(
			page.locator(".menu-panel button", { hasText: /home screen|מסך הבית/ }),
		).toHaveCount(0);
	});

	test("keeps the everyday destinations out of the menu", async ({ page }) => {
		await page.goto("/");
		await openMenu(page);
		const links = await page.locator(".menu-panel a").allInnerTexts();
		expect(links.join(" ")).toContain("Terms");
		// Browse, shelf and loans belong in the bar, not behind a menu.
		expect(links.join(" ")).not.toMatch(/Browse|My shelf/);
	});

	test("leads with inviting a neighbour, and takes you to it", async ({
		page,
	}) => {
		await page.goto("/settings");
		await openMenu(page);
		const invite = page.locator(".menu-panel a").first();
		await expect(invite).toHaveClass(/menu-invite/);
		await invite.click();
		await expect(page).toHaveURL(/\/settings#invite$/);
		// Same page, so no navigation closes it: the click has to.
		await expect(page.locator(".menu-panel")).toBeHidden();
		await expect(page.locator("#invite")).toBeInViewport();
	});

	test("opens above the map", async ({ page }) => {
		// Leaflet's panes carry z-indexes up to 1000; they must stay in the map.
		await page.goto("/settings");
		// The map sits folded under the neighbourhood field; open it.
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await page.locator(".area-map-more summary").click();
		await expect(page.locator(".map.leaflet-container")).toBeVisible();
		await openMenu(page);
		const onTop = await page
			.locator(".menu-panel a")
			.last()
			.evaluate((link) => {
				const box = link.getBoundingClientRect();
				return link.contains(
					document.elementFromPoint(
						box.x + box.width / 2,
						box.y + box.height / 2,
					),
				);
			});
		expect(onTop).toBe(true);
	});
});
