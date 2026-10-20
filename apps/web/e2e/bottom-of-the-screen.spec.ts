import { expect, test } from "@playwright/test";
import { BORROWER, aLoanInProgress, putItBack, signIn } from "./library.ts";

/**
 * The tab bar is fixed to the bottom of the viewport and the message box is
 * stuck to the bottom of the page. Left alone, the bar sits on top of the box
 * and a member cannot type. Nothing but a browser can catch that.
 */
test.describe("the bottom of the screen", () => {
	let loan: { copyId: string; loanId: string };

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		loan = await aLoanInProgress(request);
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await putItBack(request, loan);
		await request.dispose();
	});

	test("the message box is not hidden behind the tab bar", async ({ page }) => {
		await page.goto(`/loans/${loan.loanId}`);

		const composer = page.locator(".composer");
		const input = composer.locator("input[name='body']");
		await expect(composer).toBeVisible();
		await expect(input).toBeInViewport();

		const bar = page.locator(".tabbar");
		if (await bar.isVisible()) {
			const [box, barBox] = await Promise.all([
				composer.boundingBox(),
				bar.boundingBox(),
			]);
			expect(box, "the message box should have a size").not.toBeNull();
			expect(barBox, "the tab bar should have a size").not.toBeNull();
			// One pixel of slack for sub-pixel rounding, and no more.
			expect(
				box!.y + box!.height,
				"the message box runs underneath the tab bar",
			).toBeLessThanOrEqual(barBox!.y + 1);
		}

		// The real proof: Playwright refuses to click something covered up.
		await input.click();
		await expect(input).toBeFocused();
		await input.fill("Typed from a test");
		await expect(page.locator(".composer button")).toBeEnabled();
	});

	test("the send button can be pressed", async ({ page }) => {
		await page.goto(`/loans/${loan.loanId}`);

		const input = page.locator(".composer input[name='body']");
		const said = `Hello from ${test.info().project.name}`;
		await input.fill(said);
		// A covered button would time out here rather than send anything.
		await page.locator(".composer button[type='submit']").click();
		await expect(page.locator(".chat-log")).toContainText(said);
	});

	test("the page can be scrolled past the tab bar", async ({
		page,
		request,
	}) => {
		await signIn(page, request, BORROWER.email);
		await page.goto("/");

		const bar = page.locator(".tabbar");
		if (!(await bar.isVisible())) return;

		await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
		// The last thing on the page has to clear the bar, or it cannot be read
		// or tapped once you have scrolled as far as the page goes.
		const last = page.locator("#listing .tile").last();
		const [lastBox, barBox] = await Promise.all([
			last.boundingBox(),
			bar.boundingBox(),
		]);
		expect(
			lastBox!.y + lastBox!.height,
			"the end of the page is stuck under the tab bar",
		).toBeLessThanOrEqual(barBox!.y + 1);
	});
});
