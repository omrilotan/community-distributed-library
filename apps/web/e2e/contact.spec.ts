import { expect, test } from "@playwright/test";

/** Three ways of writing to the library, one form, reachable without signing in. */
test.describe("writing to the library", () => {
	test("sends a message and says so", async ({ page }) => {
		await page.goto("/contact?topic=complaint");
		await expect(page.locator("select[name='topic']")).toHaveValue("complaint");
		await page.locator("textarea[name='body']").fill("Testing the form");
		await page.locator("main form button[type='submit']").click();

		await expect(page).toHaveURL(/sent=1/);
		await expect(page.locator(".callout")).toBeVisible();
	});

	test("works for someone whose session was ended", async ({ browser }) => {
		// A cookie left from a session that was revoked: suspended, erased, or
		// signed out on another device.
		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
			extraHTTPHeaders: { cookie: "__Host-session=ended-session-token" },
		});
		const page = await visitor.newPage();
		await page.goto("/contact?topic=data");
		// Asked for an address, as anybody signed out is, and able to send.
		await page.locator("input[name='email']").fill("someone@example.com");
		await page.locator("textarea[name='body']").fill("Please delete my data");
		await page.locator("main form button[type='submit']").click();
		await expect(page).toHaveURL(/sent=1/);
		await visitor.close();
	});

	test("is in the menu, and 404 leads somewhere useful", async ({ page }) => {
		const missing = await page.goto("/no-such-page");
		expect(missing!.status()).toBe(404);
		await expect(page.locator("h1")).toContainText("not on any shelf");
		// The way out is a link to the shelves, not a dead end.
		await expect(page.locator("main a[href='/']").first()).toBeVisible();
	});
});
