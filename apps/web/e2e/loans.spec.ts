import { expect, test } from "@playwright/test";
import type { Availability } from "@cdl/contracts";
import {
	BORROWER,
	CORE,
	aLoanInProgress,
	asMember,
	putItBack,
} from "./library.ts";

/**
 * The loans page is for what still needs doing. Loans that were returned,
 * cancelled or declined stay one link away, not in the way.
 */
test.describe("finished loans", () => {
	test("stay hidden until asked for", async ({ page, request }) => {
		// One finished for certain, whatever the database already holds:
		// asked for, then withdrawn.
		const loan = await aLoanInProgress(request);
		await asMember(request, BORROWER.id, `/v1/loans/${loan.loanId}/cancel`, {});
		const finished = /^(returned|cancelled|declined)$/;
		await page.goto("/loans");
		const show = page.locator(".page-head a");
		await expect(show).toHaveCount(1);
		await expect(
			page.locator(".card .badge", { hasText: finished }),
		).toHaveCount(0);

		await show.click();
		await expect(page).toHaveURL(/past=1/);
		await expect(
			page.locator(".card .badge", { hasText: finished }).first(),
		).toBeVisible();

		await page.locator(".page-head a").click();
		await expect(page).toHaveURL(/\/loans$/);
		await putItBack(request, loan);
	});
});

/**
 * A member with no times on their grid is told so where it matters: on a
 * request, and beside the time table once the loan is on. The link goes to
 * the section of the settings page that fixes it.
 */
test.describe("an empty availability grid", () => {
	let loan: { copyId: string; loanId: string };
	let had: Availability;

	test.beforeAll(async ({ request }) => {
		had = (await asMember(request, BORROWER.id, "/v1/me/availability")).body;
		await request.put(`${CORE}/v1/me/availability`, {
			headers: { "X-Member-Id": BORROWER.id },
			data: { slots: [], meetingPlace: had.meetingPlace },
		});
		loan = await aLoanInProgress(request);
	});

	test.afterAll(async ({ request }) => {
		await putItBack(request, loan);
		await request.put(`${CORE}/v1/me/availability`, {
			headers: { "X-Member-Id": BORROWER.id },
			data: had,
		});
	});

	test("is pointed out on the request, with the way to fill it", async ({
		page,
	}) => {
		await page.goto(`/loans/${loan.loanId}`);
		const nudge = page.locator('.callout a[href="/settings#availability"]');
		await expect(nudge).toBeVisible();
		await nudge.click();
		await expect(page).toHaveURL(/\/settings#availability$/);
		await expect(page.locator("#availability")).toBeInViewport();
	});
});

/**
 * Notifications off on this device: the loans page offers to turn them on.
 * Blocked (headless Chromium's default) it says nothing; a button would not
 * work.
 */
test.describe("the notifications offer on the loans page", () => {
	test("is silent while the browser blocks notifications", async ({ page }) => {
		await page.goto("/loans");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await expect(page.locator(".push-nudge")).toHaveCount(0);
	});

	test("offers to turn them on while they are only off", async ({ page }) => {
		// Headless Chromium denies notifications whatever the context grants;
		// a member's browser that has not been asked yet says "default".
		await page.addInitScript(() =>
			Object.defineProperty(Notification, "permission", {
				get: () => "default",
			}),
		);
		await page.goto("/loans");
		const nudge = page.locator(".push-nudge");
		await expect(nudge).toBeVisible();
		await expect(nudge.getByRole("button")).toHaveText(
			"Turn on for this device",
		);
	});
});
