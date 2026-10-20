import { expect, test } from "@playwright/test";
import { copied, watchClipboard } from "./clipboard.ts";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * A new invite link is shown once, so it has to be one press away from the
 * clipboard. The signed-in browser is the borrower, made a moderator here.
 */
test.describe("a moderator's invite link", () => {
	test.use({ permissions: ["clipboard-write"] });

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("copies the new link", async ({ page }) => {
		await watchClipboard(page);
		await page.goto("/admin/invites");
		await page.locator('form[action="/api/admin/invites"] button').click();
		// Shown on the page, never carried in its address.
		await expect(page.locator(".callout .copyable-block")).toBeVisible();
		expect(page.url()).not.toContain("invite=");
		// The button only works once the client islands have hydrated.
		await expect(page.locator('.menu a[href*="back="]')).not.toHaveCount(0);

		const block = page.locator(".callout .copyable-block");
		const shown = await block.locator("code").innerText();
		expect(shown).toMatch(/\/join\?invite=/);
		await block.locator("button").click();
		await expect(block.locator("button")).toHaveText(/Copied/);
		const clipboard = await copied(page);
		expect(clipboard).toBe(shown);
		// Once: gone on the next view.
		await page.reload();
		await expect(page.locator(".callout .copyable-block")).toHaveCount(0);
	});
});

/** Straight to an inbox: no link for the moderator to pass on. */
test.describe("a moderator's invitation by email", () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("is sent, and shows who it went to", async ({ page }) => {
		const email = `neighbour-${Date.now()}@example.com`;
		await page.goto("/admin/invites");
		await page.locator('input[name="email"]').fill(email);
		await page.getByRole("button", { name: "Send invitation" }).click();
		await expect(page).toHaveURL(/sent=1/);
		await expect(page.locator(".callout")).toContainText("Invitation sent.");
		await expect(page.locator("td", { hasText: email })).toHaveCount(1);
	});

	test("says so when the address is already a member", async ({ page }) => {
		await page.goto("/admin/invites");
		await page.locator('input[name="email"]').fill("dana@example.com");
		await page.getByRole("button", { name: "Send invitation" }).click();
		await expect(page.locator(".callout-warn")).toContainText(
			"already a member",
		);
	});
});
