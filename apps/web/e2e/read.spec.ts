import { expect, test } from "@playwright/test";
import { CORE, OWNER, asMember, forgetFilters } from "./library.ts";

/**
 * A book the reader has read leaves browse and search, as their own books
 * do, until they ask for it. The signed-in browser is the borrower; the owner
 * lists a book of their own for each run.
 */
test.describe("books you have read", () => {
	let copyId = "";
	let workId = "";
	let title = "";

	test.beforeEach(async ({ request }, info) => {
		title = `Read it ${info.project.name} ${Date.now()}`;
		const added = await asMember(request, OWNER.id, "/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		copyId = added.body.id;
		const copy = await asMember(request, OWNER.id, `/v1/copies/${copyId}`);
		workId = copy.body.work.id;
	});

	test.afterEach(async ({ request }) => {
		await request.fetch(`${CORE}/v1/copies/${copyId}`, {
			method: "DELETE",
			headers: { "X-Member-Id": OWNER.id },
		});
		await forgetFilters(request);
	});

	test("leave the search, and come back when asked for", async ({ page }) => {
		const search = `/?q=${encodeURIComponent(title)}`;
		await page.goto(search);
		await expect(page.locator("#listing .tile")).toHaveCount(1);

		await page.goto(`/works/${workId}`);
		const mark = page.locator('.book-marks form[action="/api/me/read"] button');
		await expect(mark).toHaveAttribute("aria-pressed", "false");
		await mark.click();
		// In the background: the page stays, the button says what changed.
		await expect(mark).toHaveAttribute("aria-pressed", "true");
		await expect(page).toHaveURL(new RegExp(`/works/${workId}$`));

		await page.goto(search);
		await expect(page.locator("#listing .tile")).toHaveCount(0);
		await page.locator("details.filters > summary").click();
		await page.locator('.listing-controls a[href*="showRead=1"]').click();
		await expect(page.locator("#listing .tile")).toHaveCount(1);

		// And unmarked, it is back without asking.
		await page.goto(`/works/${workId}`);
		await mark.click();
		await expect(mark).toHaveAttribute("aria-pressed", "false");
		await page.goto(search);
		await expect(page.locator("#listing .tile")).toHaveCount(1);
	});
});
