import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * The moderator area's sections: on a phone, one line saying where you are
 * that opens into the groups; with room, a row of tabs.
 */
test.describe("the moderator area's sections", () => {
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

	test("say where you are, and lead to the others", async ({
		page,
		isMobile,
	}) => {
		await page.goto("/admin/loans");
		const loans = page.locator('.tabs a[href="/admin/loans"]');
		const tagging = page.locator('.tabs a[href="/admin/tagging"]');
		await expect(loans).toHaveAttribute("aria-current", "page");
		if (isMobile) {
			// Closed, it names the section and its group, and hides the rest.
			const summary = page.locator(".tabs summary");
			await expect(summary).toContainText(/Books|ספרים/);
			await expect(summary).toContainText(/Loans|השאלות/);
			await expect(tagging).toBeHidden();
			await summary.click();
		}
		await expect(tagging).toBeVisible();
		await tagging.click();
		await expect(page).toHaveURL(/\/admin\/tagging$/);
	});
});
