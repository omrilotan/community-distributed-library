import { expect, test, type Browser } from "@playwright/test";
import { BORROWER, CORE } from "./library.ts";

/**
 * A personal token, a webhook's secret and a sign-in link for another device
 * are each shown once. Without a script the form posts, and the secret comes
 * back on the page it returns to: never in its address, and gone on the next
 * view.
 */
test.describe("secrets shown once, without a script", () => {
	// Not about the size of the screen; once is enough, and the sign-in links
	// are rationed.
	test.skip(({ isMobile }) => isMobile);

	const plain = (browser: Browser) =>
		browser.newContext({
			storageState: "e2e/.auth/borrower.json",
			javaScriptEnabled: false,
		});

	const asBorrower = { "X-Member-Id": BORROWER.id };

	test("a personal token", async ({ browser, request }) => {
		const context = await plain(browser);
		const page = await context.newPage();
		const name = `No script ${Date.now()}`;
		await page.goto("/connect#tokens");
		await page.locator("#token-name").fill(name);
		await page.getByRole("button", { name: "Create token" }).click();
		await expect(page).toHaveURL(/\/connect#tokens$/);
		await expect(page.locator(".token-created code")).toHaveText(/\S{20,}/);
		await page.reload();
		await expect(page.locator(".token-created code")).toHaveCount(0);
		await context.close();

		const listed = await request.get(`${CORE}/v1/me/tokens`, {
			headers: asBorrower,
		});
		const made = (
			(await listed.json()) as {
				tokens: { id: string; clientName: string }[];
			}
		).tokens.find((token) => token.clientName === name);
		expect(made).toBeDefined();
		await request.delete(`${CORE}/v1/me/tokens/${made!.id}`, {
			headers: asBorrower,
		});
	});

	test("a webhook's secret", async ({ browser, request }) => {
		const context = await plain(browser);
		const page = await context.newPage();
		const url = `https://hooks.example/no-script-${Date.now()}`;
		await page.goto("/connect#webhooks");
		await page.locator("#webhook-url").fill(url);
		await page.getByRole("button", { name: "Subscribe" }).click();
		await expect(page).toHaveURL(/\/connect#webhooks$/);
		await expect(page.locator(".token-created code")).toHaveText(/\S{20,}/);
		// Listed already, beside its secret.
		await expect(page.locator(".hooks code", { hasText: url })).toHaveCount(1);
		await page.reload();
		await expect(page.locator(".token-created code")).toHaveCount(0);
		await context.close();

		const listed = await request.get(`${CORE}/v1/me/webhooks`, {
			headers: asBorrower,
		});
		const made = (
			(await listed.json()) as { webhooks: { id: string; url: string }[] }
		).webhooks.find((hook) => hook.url === url);
		expect(made).toBeDefined();
		await request.delete(`${CORE}/v1/me/webhooks/${made!.id}`, {
			headers: asBorrower,
		});
	});

	test("a sign-in link for another device", async ({ browser }) => {
		const context = await plain(browser);
		const page = await context.newPage();
		await page.goto("/device");
		await page.getByRole("button", { name: "Create a link" }).click();
		await expect(page).toHaveURL(/\/device$/);
		await expect(page.locator(".device-qr")).toBeVisible();
		await expect(page.locator(".device-link code")).toHaveText(
			/\/auth\/callback\?token=/,
		);
		await page.reload();
		await expect(page.locator(".device-qr")).toHaveCount(0);
		await context.close();
	});
});
