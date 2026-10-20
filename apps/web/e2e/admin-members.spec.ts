import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * The members list keeps to who is who; what can be done to a member sits
 * behind one button per row. The signed-in browser is the borrower, made the
 * library's admin for this file so every action is on offer.
 */
test.describe("the members list", () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "admin",
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

	test("leaves email and area to the member's own page", async ({ page }) => {
		await page.goto("/admin/members");
		const headings = await page.locator("thead th").allInnerTexts();
		expect(headings.join(" ")).not.toMatch(/Email|Area|אימייל|אזור/);
		await expect(page.locator("tbody")).not.toContainText("@example.com");
	});

	test("puts a member's actions behind one button", async ({ page }) => {
		await page.goto("/admin/members");
		const row = page.locator("tbody tr", {
			has: page.locator(`a[href="/admin/members/${OWNER.id}"]`),
		});
		const actions = row.locator(".row-menu");
		await expect(actions).toBeHidden();
		await row.locator(".row-menu-button").click();
		await expect(actions).toBeVisible();
		await expect(actions.locator("button")).toHaveText([
			/Remove admin|הסרת/,
			/Suspend|השעיה/,
		]);
		await page.keyboard.press("Escape");
		await expect(actions).toBeHidden();
	});
});
