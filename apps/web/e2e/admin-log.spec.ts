import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember, goToSection } from "./library.ts";

/** What moderators change is written down, and only the admin reads it. */
test.describe("the moderation log", () => {
	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("shows the admin who changed what", async ({ page, request }) => {
		// Dana (the admin) makes the borrower an admin: that is itself a change.
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "admin",
		});
		await page.goto("/admin");
		await goToSection(page, "/admin/log");
		const first = page.locator("table.log tbody tr").first();
		await expect(first).toContainText("Dana");
		await expect(first).toContainText("Changed a role");
		await expect(first).toContainText("Sam");
		// The details wait under the row until asked for.
		const more = first.locator("+ tr.log-more");
		await expect(more).toBeHidden();
		await first.locator(".log-toggle summary").click();
		await expect(more).toBeVisible();
		await expect(more).toContainText('"role": "admin"');
	});
});
