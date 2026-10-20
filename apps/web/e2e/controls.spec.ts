import { expect, test, type Page } from "@playwright/test";
import { BORROWER, CORE, OWNER, asMember, forgetFilters } from "./library.ts";

/**
 * The filter and the order live in the address bar, so paging keeps them.
 * The quick row shows what is chosen and the books kept to read; choosing,
 * ownership and order are behind the Filters disclosure, closed to begin
 * with whatever is set.
 */
const filters = (page: Page) => page.locator("details.filters");

/**
 * The first tag group offering more than one value. Only the tag rows,
 * which sit straight under the panel: the order and show rows are grouped
 * in their own box.
 */
const roomyGroup = (page: Page) =>
	filters(page)
		.locator(":scope > .filters-panel > .filter-row")
		.filter({ has: page.locator("a.chip:nth-child(2)") })
		.first();

/**
 * A fresh database tags no book, so a group with values in use is made
 * here: three books of the owner's, for three audiences. Three, so two can
 * be chosen without the group folding away.
 */
async function threeAudiences(
	request: import("@playwright/test").APIRequestContext,
) {
	const ids: string[] = [];
	for (const audience of [
		"audience:children",
		"audience:teen",
		"audience:adult",
	]) {
		const added = await asMember(request, OWNER.id, "/v1/copies", {
			manual: {
				title: `Controls ${audience} ${Date.now()}`,
				authors: ["A. Stub"],
			},
		});
		ids.push(added.body.id);
		const copy = await asMember(
			request,
			OWNER.id,
			`/v1/copies/${added.body.id}`,
		);
		await request.fetch(`${CORE}/v1/works/${copy.body.work.id}/tags`, {
			method: "PUT",
			headers: { "X-Member-Id": OWNER.id, "content-type": "application/json" },
			data: { tags: [audience] },
		});
	}
	return ids;
}

/** A tag group with room for two choices: three values or more. */
const bigGroup = (page: Page) =>
	filters(page)
		.locator(":scope > .filters-panel > .filter-row")
		.filter({ has: page.locator("a.chip:nth-child(3)") })
		.first();

async function openFilters(page: Page) {
	// Only once the page's script is live: before that a chip is a plain
	// link, which reloads at once instead of waiting for the next tap. The
	// language link in the menu gains its `back` parameter when hydration is
	// done.
	await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
	// Tap until it is open and its chips show.
	await expect(async () => {
		// A present boolean attribute reads as "", which is open, not closed.
		if ((await filters(page).getAttribute("open")) === null)
			await filters(page).locator("summary").click();
		await expect(filters(page).locator("a.chip").first()).toBeVisible({
			timeout: 1000,
		});
	}).toPass();
}

test.describe("the listing controls", () => {
	let made: string[] = [];

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		made = await threeAudiences(request);
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		for (const id of made)
			await request.fetch(`${CORE}/v1/copies/${id}`, {
				method: "DELETE",
				headers: { "X-Member-Id": OWNER.id },
			});
		await request.dispose();
	});

	test.afterEach(async ({ request }) => {
		await forgetFilters(request);
	});

	test("carry the choice into the URL and the More link", async ({ page }) => {
		await page.goto("/");
		await openFilters(page);
		await page.locator(".listing-controls a", { hasText: "A–Z" }).click();
		await expect(page).toHaveURL(/sort=title/);

		await openFilters(page);
		await page
			.locator(".listing-controls a", { hasText: "Available now" })
			.click();
		await expect(page).toHaveURL(/sort=title/);
		await expect(page).toHaveURL(/availableOnly=1/);

		const more = page.locator("[data-more]");
		if (await more.count()) {
			await expect(more).toHaveAttribute("href", /sort=title/);
			await expect(more).toHaveAttribute("href", /availableOnly=1/);
		}
	});

	test("keeps the order when a tag is chosen, and shows the tag up top", async ({
		page,
	}) => {
		await page.goto("/?sort=title");
		await openFilters(page);
		// From a group with more than one value: choosing the only value of a
		// group is no filter at all, and folds away.
		const first = roomyGroup(page).locator("a.chip").first();
		const label = await first.innerText();
		await first.click();
		await expect(page).toHaveURL(/tags=/);
		await expect(page).toHaveURL(/sort=title/);
		// The chosen tag is in the quick row; tapping it there takes it off.
		const quick = page.locator(".quick-tags a.chip", { hasText: label });
		await expect(quick).toHaveAttribute("aria-current", "true");
		await quick.click();
		await expect(page).not.toHaveURL(/tags=/);
	});

	test("takes several taps as one change", async ({ page }) => {
		await page.goto("/");
		// Only once the page's script is live: before that a tap is a plain
		// link, and CI compiles the script on its first hit. The language link
		// in the menu gains its `back` parameter when hydration is done.
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await openFilters(page);
		const chips = bigGroup(page).locator("a.chip");
		const first = await chips.nth(0).getAttribute("data-tag");
		const second = await chips.nth(1).getAttribute("data-tag");
		// Two taps in quick succession: the page waits for the second before
		// it reloads, so both are in the address together.
		await chips.nth(0).click();
		await chips.nth(1).click();
		await expect(page).toHaveURL(/tags=/);
		const tags = new URL(page.url()).searchParams.get("tags")?.split(",");
		expect(tags).toEqual(expect.arrayContaining([first, second]));
		// Both lit in the quick row.
		await expect(page.locator(".quick-tags a.chip[data-tag]")).toHaveCount(2);
	});

	test("treats every value of a group as no filter at all", async ({
		page,
	}) => {
		await page.goto("/");
		await openFilters(page);
		// Choose every value of a group, one by one; the panel closes on each
		// page, so it is opened again each time.
		const row = roomyGroup(page);
		const count = await row.locator("a.chip").count();
		expect(count).toBeGreaterThan(1);
		for (let index = 0; index < count - 1; index++) {
			await row.locator('a.chip:not([aria-current="true"])').first().click();
			await expect(page).toHaveURL(/tags=/);
			await openFilters(page);
		}
		// The last one folds the whole group away.
		await row.locator('a.chip:not([aria-current="true"])').first().click();
		await expect(page).not.toHaveURL(/tags=/);
		await expect(page.locator(".quick-tags a.chip[href*='tags=']")).toHaveCount(
			0,
		);
	});

	test("keeps the panel over the covers while a choice settles", async ({
		page,
	}) => {
		await page.goto("/");
		await openFilters(page);
		const panel = filters(page).locator(".filters-panel");
		const box = (await panel.boundingBox())!;
		await filters(page).locator("a.chip[data-param='sort']").last().click();
		await expect(page.locator("html")).toHaveAttribute(
			"data-filters-settling",
			"",
		);
		// What is drawn at the panel's foot is the panel, not a cover under it.
		const onTop = await page.evaluate(
			({ x, y }) =>
				Boolean(document.elementFromPoint(x, y)?.closest(".filters-panel")),
			{ x: box.x + box.width / 2, y: box.y + box.height - 4 },
		);
		expect(onTop).toBe(true);
	});

	test("keeps the menu over the Filters row", async ({ page }) => {
		await page.goto("/");
		await page.locator(".menu > summary").click();
		const items = page.locator(".menu-panel a, .menu-panel button");
		await expect(items.first()).toBeVisible();
		// Every entry is drawn on top, including those over the chips.
		const covered = await items.evaluateAll((all) =>
			all
				.filter((item) => {
					const box = item.getBoundingClientRect();
					const top = document.elementFromPoint(
						box.x + box.width / 2,
						box.y + box.height / 2,
					);
					return !top?.closest(".menu-panel");
				})
				.map((item) => item.textContent),
		);
		expect(covered).toEqual([]);
	});

	test("orders the shelves alphabetically when asked", async ({ page }) => {
		await page.goto("/?sort=title");
		const titles = await page.locator("#listing .tile-title").allInnerTexts();
		expect(titles.length).toBeGreaterThan(1);
		const collator = new Intl.Collator(["he", "en"], { numeric: true });
		expect(titles).toEqual([...titles].sort(collator.compare));
	});

	test("leaves your own books out until you ask for them", async ({
		page,
		request,
	}) => {
		// A book of the reader's own, found by its title wherever the
		// shelves' order puts it.
		const title = `Mine to keep ${Date.now()}`;
		const added = await asMember(request, BORROWER.id, "/v1/copies", {
			manual: { title, authors: ["A. Stub"] },
		});
		try {
			await page.goto("/");
			const without = await page.locator("#listing .tile").count();
			// "yours" only appears on a tile the viewer owns every copy of.
			await expect(
				page.locator("#listing .badge", { hasText: "yours" }),
			).toHaveCount(0);

			await openFilters(page);
			const mine = page.locator(".listing-controls a", {
				hasText: "Show mine",
			});
			await mine.click();
			await expect(page).toHaveURL(/showMine=1/);
			// Back from a choice made in it, the panel is folded away.
			await expect(filters(page)).not.toHaveAttribute("open");
			await openFilters(page);
			await expect(mine).toHaveAttribute("aria-current", "true");

			// The same chip again puts them away.
			await mine.click();
			await expect(page).not.toHaveURL(/showMine/);
			await expect(page.locator("#listing .tile")).toHaveCount(without);

			// The reader's own book: out of a search for it, in once asked for.
			const own = page.locator("#listing .tile", { hasText: title });
			await page.goto(`/?q=${encodeURIComponent(title)}`);
			await expect(own).toHaveCount(0);
			await page.goto(`/?q=${encodeURIComponent(title)}&showMine=1`);
			await expect(own).toHaveCount(1);
			await expect(own.locator(".badge", { hasText: "yours" })).toHaveCount(1);
		} finally {
			await request.fetch(`${CORE}/v1/copies/${added.body.id}`, {
				method: "DELETE",
				headers: { "X-Member-Id": BORROWER.id },
			});
		}
	});

	test("offers to remove the filters when nothing is left", async ({
		page,
	}) => {
		await page.goto("/?q=zzqx-nothing&availableOnly=1&sort=title");
		const remove = page.locator(".empty a.btn");
		await expect(remove).toHaveText("Remove filter");
		await remove.click();
		await expect(page).toHaveURL(/q=zzqx-nothing/);
		await expect(page).toHaveURL(/sort=title/);
		await expect(page).not.toHaveURL(/availableOnly/);
		// A search that finds nothing, with no filter on: nothing to remove.
		await expect(page.locator(".empty a.btn")).toHaveCount(0);
	});

	test("keeps the filters through a search", async ({ page }) => {
		await page.goto("/?availableOnly=1&sort=title");
		await page.locator("form.search input[name=q]").fill("zzqx-nothing");
		await page.locator("form.search button").click();
		await expect(page).toHaveURL(/q=zzqx-nothing/);
		await expect(page).toHaveURL(/availableOnly=1/);
		await expect(page).toHaveURL(/sort=title/);
	});

	test("shows every book, newest first, by default", async ({ page }) => {
		await page.goto("/");
		await openFilters(page);
		await expect(
			page.locator(".listing-controls a", { hasText: "Available now" }),
		).not.toHaveAttribute("aria-current", "true");
		await expect(
			page.locator('.listing-controls a[aria-current="true"]', {
				hasText: "New",
			}),
		).toHaveCount(1);
	});
});
