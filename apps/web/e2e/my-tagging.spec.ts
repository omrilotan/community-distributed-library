import { expect, test } from "@playwright/test";
import { BORROWER, CORE, asMember } from "./library.ts";

/**
 * A member tags their own books one after another, from their shelf. The
 * book is made before and taken back after in hooks: a test that times out
 * never reaches its own last lines, and a book left behind is the first one
 * the next run sees.
 */
test.describe("tagging one's own books", () => {
	let title = "";
	let copyId = "";
	let workId = "";

	test.beforeEach(async ({ request }) => {
		title = `Aaa my tagging ${Date.now()}`;
		const copy = await asMember(request, BORROWER.id, "/v1/copies", {
			manual: { title, authors: ["A. Tester"] },
		});
		copyId = copy.body.id;
		workId = copy.body.workId;
	});

	test.afterEach(async ({ request }) => {
		await request.fetch(`${CORE}/v1/copies/${copyId}`, {
			method: "DELETE",
			headers: { "X-Member-Id": BORROWER.id },
		});
	});

	test("tags a book of one's own and moves on", async ({ page, request }) => {
		await page.goto("/shelf");
		await page.locator('a[href="/shelf/tagging"]').click();
		await expect(page.locator(".tagging-book h2")).toContainText(title);
		await page.locator(".chip-check", { hasText: "Poetry" }).click();
		await page.locator("form.tagging button[type='submit']").click();
		await expect(page).toHaveURL(/\/shelf\/tagging\?only=untagged&at=0/);
		// The next untagged book, or none left: on a fresh database it was the only one.
		await expect(
			page.locator(".tagging-book h2", { hasText: title }),
		).toHaveCount(0);

		const tags = await asMember(
			request,
			BORROWER.id,
			`/v1/works/${workId}/tags`,
		);
		expect(tags.body.tags).toContain("genre:poetry");
	});

	test("walks the books with no audience, then leaves one once it has one", async ({
		page,
	}) => {
		await page.goto("/shelf/tagging");
		await page
			.locator(".tagging-filter a.chip", { hasText: "No audience" })
			.click();
		await expect(page).toHaveURL(/only=missing%3Aaudience&at=0/);
		await expect(page.locator(".tagging-book h2")).toContainText(title);
		// A genre alone keeps it in this queue; Save moves one further on.
		await page.locator(".chip-check", { hasText: "Poetry" }).click();
		await page.locator("form.tagging button[type='submit']").click();
		await expect(page).toHaveURL(/only=missing%3Aaudience&at=1/);
		await page.goto("/shelf/tagging?only=missing:audience&at=0");
		await expect(page.locator(".tagging-book h2")).toContainText(title);
		await page.locator(".chip-check", { hasText: "Adults" }).click();
		await page.locator("form.tagging button[type='submit']").click();
		// Now it has one, so the next book takes its place.
		await expect(page).toHaveURL(/only=missing%3Aaudience&at=0/);
		await expect(
			page.locator(".tagging-book h2", { hasText: title }),
		).toHaveCount(0);
	});
});
