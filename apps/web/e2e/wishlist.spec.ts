import { expect, test } from "@playwright/test";
import { CORE, OWNER, asMember, forgetFilters } from "./library.ts";

/**
 * A book kept for later, from its page, on a page of its own. The signed-in
 * browser is the borrower; the owner lists a book for each run.
 */
test.describe("the wishlist", () => {
	let copyId = "";
	let workId = "";
	let title = "";

	test.beforeEach(async ({ request }, info) => {
		title = `Want it ${info.project.name} ${Date.now()}`;
		const added = await asMember(request, OWNER.id, "/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		copyId = added.body.id;
		workId = (await asMember(request, OWNER.id, `/v1/copies/${copyId}`)).body
			.work.id;
	});

	test.afterEach(async ({ request }) => {
		await request.fetch(`${CORE}/v1/copies/${copyId}`, {
			method: "DELETE",
			headers: { "X-Member-Id": OWNER.id },
		});
		await forgetFilters(request);
	});

	test("keeps a book from its page, and lets it go", async ({ page }) => {
		await page.goto(`/works/${workId}`);
		const keep = page.locator(
			'.book-marks form[action="/api/me/wishlist"] button',
		);
		await expect(keep).toHaveAttribute("aria-pressed", "false");
		await keep.click();
		await expect(keep).toHaveAttribute("aria-pressed", "true");

		// A filter on the shelves, like the others.
		await page.goto("/");
		await page.locator('.chip[href*="wished=1"]').click();
		await expect(page).toHaveURL(/wished=1/);
		await expect(
			page.locator("#listing .tile", { hasText: title }),
		).toHaveCount(1);
		// And a page of its own.
		await page.goto("/wishlist");
		await expect(
			page.locator("#listing .tile", { hasText: title }),
		).toHaveCount(1);

		await page.goto(`/works/${workId}`);
		await keep.click();
		await expect(keep).toHaveAttribute("aria-pressed", "false");
		await page.goto("/wishlist");
		await expect(
			page.locator("#listing .tile", { hasText: title }),
		).toHaveCount(0);
	});
});
