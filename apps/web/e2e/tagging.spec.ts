import { expect, test } from "@playwright/test";
import { slugify } from "@cdl/contracts";
import { BORROWER, CORE, OWNER, asMember } from "./library.ts";

/**
 * Flipping through books to tag them, and adding a value the vocabulary
 * lacks on the way. The signed-in browser is the borrower, made a moderator
 * for this file.
 */
test.describe("tagging one book at a time", () => {
	test.describe.configure({ mode: "serial" });
	const genre = `Tagtest ${Date.now().toString(36)}`;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		// The genre this run made goes again, off the book too: a book holds
		// fifty tags at most, and every run would otherwise leave one more.
		await request.fetch(
			`${CORE}/v1/admin/tags/${encodeURIComponent(`genre:${slugify(genre)}`)}`,
			{ method: "DELETE", headers: { "X-Member-Id": OWNER.id } },
		);
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("tags a book with a brand-new genre and moves on", async ({ page }) => {
		await page.goto("/admin/tagging?only=all&at=0");
		const title = await page.locator(".tagging-book h2").innerText();
		await page.locator('input[name="new:genre"]').fill(genre);
		await page.locator('input[name="new:genre"]').press("Enter");
		await expect(page).toHaveURL(/only=all&at=1/);
		await expect(page.locator(".tagging-book h2")).not.toHaveText(title);

		// The new value is now in the vocabulary, ticked on the book just saved.
		await page.goto("/admin/tagging?only=all&at=0");
		await expect(
			page.locator(".chip-check", { hasText: genre }).locator("input"),
		).toBeChecked();
	});
});
