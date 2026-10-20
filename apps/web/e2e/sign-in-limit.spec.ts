import { expect, test } from "@playwright/test";

/**
 * Sign-in links are rationed: three to an address from one place in a
 * quarter of an hour. The fourth ask is not an error to puzzle over but a
 * word on how long to wait, and nothing is sent.
 */
test("asking for one sign-in link too many says how long to wait", async ({
	browser,
	isMobile,
}) => {
	// Not about the size of the screen, and the links are rationed by place.
	test.skip(isMobile);
	const visitor = await browser.newContext({
		storageState: { cookies: [], origins: [] },
	});
	const page = await visitor.newPage();
	// Nobody's address, so no link signs anybody in along the way.
	const email = `nobody-${Date.now()}@example.com`;
	const ask = async () => {
		await page.goto("/login");
		await page.locator("#email").fill(email);
		await page
			.locator('form[action="/api/auth/magic-link"] button[type=submit]')
			.click();
	};

	for (let asked = 1; asked <= 3; asked++) {
		await ask();
		await expect(page).toHaveURL(/[?&]sent=1/);
	}
	await ask();
	await expect(page).toHaveURL(/[?&]error=rate/);
	await expect(page.locator(".callout-warn")).toContainText(
		/try again in \d+ minutes?/i,
	);
	await visitor.close();
});
