import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * A moderator checking what a member sees. It is a view, not a role: the
 * account keeps its permissions, and the banner says which view is on.
 *
 * The signed-in browser belongs to the borrower, so it is made a moderator for
 * the length of this file — the local database is a copy of production, where
 * the seeded moderator's address is somebody's real one.
 */
test.describe("seeing the library as a member", () => {
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

	test("hides the moderator's own affordances, and gives them back", async ({
		page,
	}) => {
		const menu = page.locator(".menu");
		await page.goto("/");
		await menu.locator("summary").click();
		await expect(menu.locator('a[href="/admin"]')).toHaveCount(1);

		// From the moderation page itself, out to the shelves as a member.
		await page.goto("/admin");
		await page.locator('a[href^="/view-as?as=member"]').click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator(".viewing-as")).toBeVisible();

		// The menu no longer offers the panel, and the panel says no.
		await menu.locator("summary").click();
		await expect(menu.locator('a[href="/admin"]')).toHaveCount(0);
		await page.goto("/admin");
		await expect(page.locator(".empty")).toContainText("for moderators");

		// Back again, from the banner, and on the page they were reading.
		await page.goto("/about");
		await page.locator('.viewing-as a[href="/view-as?as=moderator"]').click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.locator(".viewing-as")).toHaveCount(0);
		await page.goto("/admin");
		await expect(page.locator("nav.tabs")).toBeVisible();
	});
});
