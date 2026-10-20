import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/** From the overview's count of active loans to the list of who has what. */
test.describe("the moderators' Loans tab", () => {
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

	test("opens from the overview's active-loans figure", async ({ page }) => {
		await page.goto("/admin");
		const stat = page.locator('.stats a[href="/admin/loans"]');
		await expect(stat).toContainText("active loans");
		await stat.click();
		await expect(page).toHaveURL(/\/admin\/loans$/);
		await expect(page.locator('.tabs a[href="/admin/loans"]')).toHaveAttribute(
			"aria-current",
			"page",
		);
		await page.locator(".filter-chips a", { hasText: "All" }).click();
		await expect(page).toHaveURL(/status=all/);
	});
});
