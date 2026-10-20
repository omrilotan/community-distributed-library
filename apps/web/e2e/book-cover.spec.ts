import { expect, test, type Locator, type Page } from "@playwright/test";
import { BORROWER, CORE, asMember } from "./library.ts";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";

/**
 * The cover is a thumbnail beside the title, never the whole page. It lost its
 * width once already, when a page stopped using the grid that sized it.
 */
test.describe("the cover of a book", () => {
	let copyId: string;
	let workId: string;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		const copy = await asMember(request, BORROWER.id, "/v1/copies", {
			manual: {
				title: `Cover Test ${Date.now()}`,
				authors: ["A Tester"],
				coverUrl: `${WEB}/icon-512.png`,
			},
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
		await request.dispose();
	});

	/** A thumbnail, and the title reading beside it rather than under it. */
	async function beside(page: Page, cover: Locator) {
		const [box, width] = await Promise.all([
			cover.boundingBox(),
			page.evaluate(() => document.documentElement.clientWidth),
		]);
		expect(box, "the cover should have a size").not.toBeNull();
		expect(
			box!.width,
			"the cover is wider than a thumbnail",
		).toBeLessThanOrEqual(176);
		expect(box!.width, "the cover takes over the page").toBeLessThan(width / 2);

		// Asked of the layout rather than of the image, which may or may not
		// have loaded: two columns means the title reads beside the cover.
		const columns = await page
			.locator(".book-head")
			.evaluate(
				(element) =>
					getComputedStyle(element).gridTemplateColumns.split(" ").length,
			);
		expect(columns, "the title dropped below the cover").toBe(2);
	}

	test("stays a thumbnail on the book page", async ({ page }) => {
		await page.goto(`/works/${workId}`);
		await beside(page, page.locator(".book-cover"));
	});

	test("stays a thumbnail on your own copy", async ({ page }) => {
		await page.goto(`/shelf/${copyId}`);
		await beside(page, page.locator(".book-cover"));
	});
});
