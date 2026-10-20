import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * A moderator keeping the vocabulary without waiting for a suggestion: add a
 * tag, rename it, take it away, and tag a book that is not theirs. The
 * signed-in browser is the borrower, made a moderator for this file.
 */
test.describe("a moderator's tags", () => {
	test.describe.configure({ mode: "serial" });
	const value = `test-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
	// Unique per run: phone and desktop share one database at the same time.
	const shelf = `Test shelf ${value}`;
	const renamed = `Renamed shelf ${value}`;

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

	test("adds, renames and removes a tag", async ({ page }) => {
		await page.goto("/admin/tags");
		await page.locator("details.tag-add > summary").click();
		await page.locator("#tag-group").selectOption("genre");
		await page.locator("#tag-value").fill(value);
		await page.locator("#tag-en").fill(shelf);
		await page.locator("#tag-he").fill("מדף ניסיון");
		await page.locator("details.tag-add button[type='submit']").click();
		await expect(page).toHaveURL(/added=genre%3A/);

		// Edits save in the background: the page stays, the list redraws.
		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		const url = page.url();
		const chip = page.locator(".tag-list summary", { hasText: shelf });
		await chip.click();
		const open = page.locator(".tag-list details[open]");
		await open.locator("input[name='labelEn']").fill(renamed);
		await open.locator("button.secondary").click();
		await expect(
			page.locator(".tag-list summary", { hasText: renamed }),
		).toHaveCount(1);
		expect(page.url()).toBe(url);

		// Still open after saving: the redraw keeps where the moderator was.
		const renamedTag = page.locator(".tag-list details", {
			has: page.locator("summary", { hasText: renamed }),
		});
		await expect(renamedTag).toHaveAttribute("open", "");
		await renamedTag.locator("button.link").click();
		await expect(
			page.locator(".tag-list summary", { hasText: renamed }),
		).toHaveCount(0);
		expect(page.url()).toBe(url);
	});

	test("can tag a book that is not theirs", async ({ page }) => {
		// A seeded book belongs to the other member.
		await page.goto("/works/01J0SEEDWORK00000000000003");
		// The tag editor itself, not the moderator's book-details panel beside
		// it: the one form here that posts to the book's tags.
		await expect(
			page.locator('details.tag-edit form[action$="/tags"]'),
		).toHaveCount(1);
	});
});
