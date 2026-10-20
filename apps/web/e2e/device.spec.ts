import { expect, test } from "@playwright/test";

/**
 * Signing in on another device: a link and a code made on the device already
 * signed in, opened on one that is not.
 */
test("signs in another device with a one-time link", async ({
	page,
	browser,
}) => {
	// From the top of the settings page.
	await page.goto("/settings");
	await page.locator('.quick-links a[href="/device"]').click();
	await expect(page).toHaveURL(/\/device$/);
	// The button works once the page is live; the menu's language link says when.
	await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);

	await page.locator(".device-link button").click();
	await expect(page.locator(".device-qr")).toBeVisible();
	const url = await page.locator(".device-link code").innerText();
	expect(url).toMatch(/\/auth\/callback\?token=/);

	// Another device: nobody signed in.
	const other = await browser.newContext({
		storageState: { cookies: [], origins: [] },
	});
	// A mail scanner opening the link first spends nothing.
	expect((await other.request.get(url)).status()).toBe(200);
	const phone = await other.newPage();
	await phone.goto(url);
	await phone.locator('form[action="/api/auth/exchange"] button').click();
	// Signed in, to the books (or the filters this member left them on).
	await expect(phone).toHaveURL(/\/(\?.*)?$/);
	await phone.goto("/shelf");
	await expect(phone).toHaveURL(/\/shelf$/);

	// Once only.
	const third = await browser.newContext({
		storageState: { cookies: [], origins: [] },
	});
	const again = await third.newPage();
	await again.goto(url);
	await again.locator('form[action="/api/auth/exchange"] button').click();
	await expect(again).toHaveURL(/\/login\?error=1$/);
	await again.goto("/shelf");
	await expect(again).not.toHaveURL(/\/shelf$/);
	await other.close();
	await third.close();
});
