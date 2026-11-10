import { expect, test } from "@playwright/test";
import { BORROWER, CORE, OWNER, asMember } from "./library.ts";

/**
 * A new request reaches its owner a few minutes after it is made. Until
 * then the asker's loans page says so, offers no nudge, and the loan's page
 * can still take it back.
 */
test.describe("a request not yet sent on", () => {
	let copyId: string;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		const copy = await asMember(request, OWNER.id, "/v1/copies", {
			manual: { title: `Held ${Date.now()}`, authors: ["A Writer"] },
		});
		copyId = copy.body.id;
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await request.fetch(`${CORE}/v1/copies/${copyId}`, {
			method: "DELETE",
			headers: { "X-Member-Id": OWNER.id },
		});
		await request.dispose();
	});

	test("says when the owner hears of it, and can be taken back unheard", async ({
		page,
		request,
	}) => {
		const asked = await asMember(request, BORROWER.id, "/v1/loans", { copyId });
		expect(asked.status).toBe(201);

		await page.goto("/loans");
		const row = page.locator("article", { hasText: "Held " }).first();
		await expect(row).toContainText(/hears about it in [1-5] minutes?/);
		await expect(row.getByRole("button", { name: "Nudge" })).toHaveCount(0);
		// Taken back on its page, where every step of a loan is.
		await row.getByRole("link", { name: "View request" }).click();
		await expect(page).toHaveURL(/\/loans\/./);
		await page.getByRole("button", { name: "Cancel" }).click();
		await page.goto("/loans");
		await expect(page.locator("article", { hasText: "Held " })).toHaveCount(0);
	});
});
