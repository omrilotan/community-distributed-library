import { expect, test } from "@playwright/test";
import { BORROWER, CORE, OWNER, asMember } from "./library.ts";

/**
 * A book with no description of its own often has one in a copy's note: the
 * translator, the illustrator. A moderator correcting the book starts from
 * it, told where it came from, and nothing is saved until they save.
 */
test.describe("the book's description", () => {
	let copyId: string;
	let workId: string;
	const note = `Translated by A. Translator ${Date.now()}`;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		const copy = await asMember(request, BORROWER.id, "/v1/copies", {
			manual: { title: `Described ${Date.now()}`, authors: ["A Writer"] },
			note,
		});
		copyId = copy.body.id;
		const detail = await asMember(request, BORROWER.id, `/v1/copies/${copyId}`);
		workId = detail.body.work.id;
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await request.fetch(`${CORE}/v1/copies/${copyId}`, {
			method: "DELETE",
			headers: { "X-Member-Id": BORROWER.id },
		});
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("starts from a copy's note when the book has none", async ({ page }) => {
		await page.goto(`/works/${workId}`);
		// Not shown as the book's description until a moderator saves it.
		await expect(page.locator(".book-note")).toHaveCount(0);
		await page
			.locator("details.tag-edit", { has: page.locator("#work-note") })
			.locator("summary")
			.click();
		await expect(page.locator("#work-note")).toHaveValue(note);
		await expect(page.locator("#work-note-from")).toBeVisible();
	});
});
