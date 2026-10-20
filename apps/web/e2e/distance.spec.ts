import { expect, test } from "@playwright/test";
import { BORROWER, asMember, forgetFilters } from "./library.ts";

/**
 * Nothing is hidden for being far away unless the member asks. The whole
 * library is on the shelves; a radius is a filter like any other.
 */
test.describe("distance", () => {
	test.afterEach(({ request }) => forgetFilters(request));

	test("is no limit until asked for", async ({ request }) => {
		const all = await asMember(request, BORROWER.id, "/v1/browse?limit=1");
		const near = await asMember(
			request,
			BORROWER.id,
			"/v1/browse?limit=1&within=1000",
		);
		expect(all.status).toBe(200);
		expect(all.body.total).toBeGreaterThanOrEqual(near.body.total);
	});

	test("can be narrowed from the filters, and widened again", async ({
		page,
	}) => {
		// Filters start folded, and fold again after a change made in them.
		const distance = async () => {
			await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
			const filters = page.locator("details.filters");
			if ((await filters.getAttribute("open")) === null)
				await filters.locator("summary").click();
			return filters.getByRole("group", { name: "Distance" });
		};

		await page.goto("/");
		let group = await distance();
		await expect(group.getByRole("link", { name: "Any" })).toHaveAttribute(
			"aria-current",
			"true",
		);

		await group.getByRole("link", { name: "Up to 1 km" }).click();
		await expect(page).toHaveURL(/within=1000/);
		group = await distance();
		await expect(
			group.getByRole("link", { name: "Up to 1 km" }),
		).toHaveAttribute("aria-current", "true");

		await group.getByRole("link", { name: "Any" }).click();
		await expect(page).not.toHaveURL(/within=/);
	});
});
