import { expect, test } from "@playwright/test";
import { asMember, CORE, OWNER } from "./library.ts";

/**
 * An assistant's sign-in window is a browser of its own: the email's link
 * opens somewhere else. So a signed-out visit to the consent screen comes
 * back to it after signing in, and the email carries a code that signs in
 * the browser that asked for it.
 */
test.describe("signing in for an assistant", () => {
	// About the flow, not the screen; and sign-in links are rationed.
	test.skip(({ isMobile }) => isMobile);

	test("comes back to the consent screen after signing in", async ({
		browser,
	}) => {
		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
		});
		const page = await visitor.newPage();
		// Shaped like a real request; no such request exists, which is fine here.
		const req = "0b7c1e52-3f0a-4d4e-9c8a-2a1f5e6d7c8b";
		await page.goto(`/oauth/consent?req=${req}`);
		await expect(page).toHaveURL(/\/login\?back=/);

		await page.locator("#email").fill(OWNER.email);
		await page
			.locator('form[action="/api/auth/magic-link"] button[type=submit]')
			.click();
		// Development opens the link at once; the button spends it.
		await page.locator('form[action="/api/auth/exchange"] button').click();
		await expect(page).toHaveURL(new RegExp(`/oauth/consent\\?req=${req}$`));
		await visitor.close();
	});

	test("takes the email's code in the browser that asked", async ({
		browser,
		request,
	}) => {
		// Somebody new, so no member's ration of links is spent.
		const invite = await asMember(request, OWNER.id, "/v1/invites", {});
		const email = `code-${Date.now()}@example.com`;
		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
		});
		const page = await visitor.newPage();
		await page.goto(`/login?invite=${encodeURIComponent(invite.body.token)}`);
		await page.locator("#email").fill(email);
		await page
			.locator('form[action="/api/auth/magic-link"] button[type=submit]')
			.click();
		await page.waitForURL(/\/auth\/callback/);

		// The value this browser keeps, and the code core binds to it: in
		// development core hands the code back, as it does the link.
		const kept = (await visitor.cookies()).find(
			(cookie) => cookie.name === "__Host-sign-in",
		);
		expect(kept?.httpOnly).toBe(true);
		expect(kept?.secure).toBe(true);
		const asked = await request.post(`${CORE}/v1/auth/magic-link`, {
			// A place of its own, so the run's other sign-ins keep their hour.
			headers: { "x-cdl-client-ip": "198.51.100.23" },
			data: { email, invite: invite.body.token, browser: kept!.value },
		});
		const { debugCode } = (await asked.json()) as { debugCode: string };
		expect(debugCode).toMatch(/^\d{8}$/);

		await page.goto("/login?sent=1");
		const code = page.locator("#code");
		await code.fill("0000 0000");
		await page.locator('form[action="/api/auth/code"] button').click();
		await expect(page.getByText(/code did not work/i)).toBeVisible();

		// Typed the way the email shows it: four digits, a space, four.
		await code.fill(`${debugCode.slice(0, 4)} ${debugCode.slice(4)}`);
		await page.locator('form[action="/api/auth/code"] button').click();
		await expect(page).toHaveURL(/\/start/);
		expect(
			(await visitor.cookies()).some(
				(cookie) => cookie.name === "__Host-sign-in",
			),
		).toBe(false);
		await visitor.close();
	});
});
