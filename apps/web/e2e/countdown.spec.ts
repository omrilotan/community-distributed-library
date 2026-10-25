import { expect, test } from "@playwright/test";
import { BORROWER, CORE, OWNER, asMember } from "./library.ts";

/**
 * Asking to borrow waits three seconds, counting down on the button, and a
 * second press in that time takes it back: nothing reaches the owner.
 */
test.describe("asking to borrow", () => {
	let copyId: string;
	let workId: string;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		const copy = await asMember(request, OWNER.id, "/v1/copies", {
			manual: { title: `Countdown ${Date.now()}`, authors: ["A Writer"] },
		});
		copyId = copy.body.id;
		const detail = await asMember(request, OWNER.id, `/v1/copies/${copyId}`);
		workId = detail.body.work.id;
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		const loans = await asMember(request, BORROWER.id, "/v1/me/loans");
		const loan = loans.body.borrowing.find(
			(entry: { copy: { id: string } }) => entry.copy.id === copyId,
		);
		if (loan)
			await asMember(request, BORROWER.id, `/v1/loans/${loan.id}/cancel`, {});
		await request.fetch(`${CORE}/v1/copies/${copyId}`, {
			method: "DELETE",
			headers: { "X-Member-Id": OWNER.id },
		});
		await request.dispose();
	});

	test("counts down, can be taken back, and then goes", async ({
		page,
		request,
	}) => {
		await page.goto(`/works/${workId}`);
		await expect(page.locator("html")).toHaveAttribute("data-countdown", "on");
		const button = page.locator("form.request button[type=submit]");
		await expect(button).toHaveText("Borrow");

		await button.click();
		await expect(button).toHaveText(/^Cancel · [123]$/);
		await expect(page.locator("form.request .countdown-status")).toHaveText(
			/Sending your request in [123] seconds?\. Press again to cancel\./,
		);
		await button.click();
		await expect(button).toHaveText("Borrow");
		await expect(page.locator("form.request .countdown-status")).toHaveText(
			"Not sent.",
		);
		// Longer than the countdown: still here, and nothing was asked.
		await page.waitForTimeout(3_500);
		await expect(page).not.toHaveURL(/requested=1/);
		const none = await asMember(request, BORROWER.id, "/v1/me/loans");
		expect(
			none.body.borrowing.some(
				(entry: { copy: { id: string } }) => entry.copy.id === copyId,
			),
		).toBe(false);

		await button.click();
		await expect(page).toHaveURL(/requested=1/, { timeout: 10_000 });
	});
});
