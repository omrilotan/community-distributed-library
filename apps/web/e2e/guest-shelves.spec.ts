import { expect, test, type Browser } from "@playwright/test";
import { CORE, OWNER, asMember } from "./library.ts";

/**
 * Somebody not signed in sees the front door, kept short, and under it the
 * shelves: covers, titles and authors, nobody's name and no distances. A
 * book opens a note that borrowing is for members.
 */
async function stranger(browser: Browser) {
	const visitor = await browser.newContext({
		storageState: { cookies: [], origins: [] },
	});
	await visitor.addCookies([
		{ name: "locale", value: "en", url: "http://localhost:3000" },
	]);
	return visitor;
}

test.describe("the shelves for a stranger", () => {
	test("gives a shared link a card with a picture", async ({ request }) => {
		const html = await (await request.get("/")).text();
		expect(html).toMatch(/<meta property="og:title" content="[^"]+"/);
		expect(html).toMatch(
			/<meta property="og:image" content="https?:\/\/[^"]+\/icon-512\.png/,
		);
	});

	test("shows the front door, then the books, with nobody's details", async ({
		browser,
	}) => {
		const visitor = await stranger(browser);
		const page = await visitor.newPage();
		await page.goto("/");
		await expect(page.locator(".guest-intro h1")).toBeVisible();
		await expect(page.locator(".guest-intro a[href='/login']")).toBeVisible();
		await expect(page.locator(".guest-invite")).toBeVisible();

		const tiles = page.locator("#listing .tile");
		await expect(tiles.first()).toBeVisible();
		// Title and author only: no badge, nobody's name, no distance.
		await expect(page.locator("#listing .badge")).toHaveCount(0);
		await expect(page.locator("#listing .tile-who")).toHaveCount(0);
		await expect(page.locator("#listing")).not.toContainText(
			/\d+(\.\d+)?\s?k?m\b/,
		);
		await expect(page.locator(".listing-total")).toContainText(/\d/);

		// The front door takes no more than about half a phone's screen.
		const intro = await page.locator(".guest-intro").boundingBox();
		const viewport = page.viewportSize();
		expect(intro).not.toBeNull();
		if (viewport && viewport.width < 600)
			expect(intro!.y + intro!.height).toBeLessThan(viewport.height * 0.6);
		await visitor.close();
	});

	test("says borrowing is for members when a book is tapped", async ({
		browser,
	}) => {
		const visitor = await stranger(browser);
		const page = await visitor.newPage();
		await page.goto("/");
		const first = page.locator("#listing .tile").first();
		const title = await first.locator(".tile-title").innerText();
		const sheet = page.locator("#members-only");
		// The note opens without script; the tapped book shows once the
		// page's script is live, so tap until it does.
		await expect(async () => {
			if (await sheet.isVisible())
				await sheet.getByRole("button", { name: "Keep looking" }).click();
			await first.click();
			await expect(sheet).toBeVisible({ timeout: 1000 });
			await expect(sheet.locator(".sheet-book-title")).toHaveText(title, {
				timeout: 1000,
			});
		}).toPass();
		await expect(sheet.locator("h2")).toHaveText("Only members can borrow");
		await expect(page).toHaveURL(/\/$/);
		await sheet.getByRole("button", { name: "Keep looking" }).click();
		await expect(sheet).toBeHidden();
		await visitor.close();
	});

	test("searches and orders without signing in", async ({
		browser,
		request,
	}) => {
		const title = `Stranger finds ${Date.now()}`;
		const added = await asMember(request, OWNER.id, "/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		const visitor = await stranger(browser);
		const page = await visitor.newPage();
		try {
			await page.goto("/?sort=title");
			const titles = await page.locator("#listing .tile-title").allInnerTexts();
			expect(titles.length).toBeGreaterThan(1);
			const collator = new Intl.Collator(["he", "en"], { numeric: true });
			expect(titles).toEqual([...titles].sort(collator.compare));

			await page.locator("input[name='q']").fill(title);
			await page.locator("form.search button[type='submit']").click();
			await expect(page).toHaveURL(/q=/);
			await expect(page.locator("#listing .tile-title")).toHaveText([title]);
		} finally {
			await visitor.close();
			await request.fetch(`${CORE}/v1/copies/${added.body.id}`, {
				method: "DELETE",
				headers: { "X-Member-Id": OWNER.id },
			});
		}
	});

	test("opens Filters beside the chips, over the shelves", async ({
		browser,
	}) => {
		const visitor = await stranger(browser);
		const page = await visitor.newPage();
		await page.goto("/");
		const bar = page.locator(".filter-bar");
		await expect(bar.locator("details.filters > summary")).toBeVisible();
		// One line, however many chips: the row scrolls rather than wraps.
		const tops = await bar
			.locator(".filter-strip a.chip")
			.evaluateAll((chips) =>
				chips.map((chip) => Math.round(chip.getBoundingClientRect().top)),
			);
		expect(new Set(tops).size).toBeLessThanOrEqual(1);
		await bar.locator("details.filters > summary").click();
		await expect(bar.locator(".filters-panel")).toBeVisible();
		// Order by date or title only: nothing that needs a place or a shelf.
		await expect(bar.locator("a.chip[data-value='distance']")).toHaveCount(0);
		await expect(bar.locator("a.chip[data-toggle]")).toHaveCount(0);
		await visitor.close();
	});
});
