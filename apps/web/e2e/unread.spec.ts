import { expect, test } from "@playwright/test";
import {
	BORROWER,
	OWNER,
	aLoanInProgress,
	asMember,
	putItBack,
} from "./library.ts";

/** Something new on a loan shows on it and on the Loans tab until it is read. */
test("counts a new message until the loan is opened", async ({
	page,
	request,
}) => {
	const loan = await aLoanInProgress(request);
	// Seen once, so only what comes after is new. Times are whole seconds:
	// what comes after has to come a second later, not in the same one.
	await asMember(request, BORROWER.id, `/v1/loans/${loan.loanId}/messages`);
	await new Promise((resolve) => setTimeout(resolve, 1100));
	await asMember(request, OWNER.id, `/v1/loans/${loan.loanId}/messages`, {
		body: "Is Tuesday good?",
	});

	await page.goto("/loans");
	const row = page.locator("article.card", {
		has: page.locator(`a[href="/loans/${loan.loanId}"]`),
	});
	await expect(row.locator(".badge-unread")).toHaveText("1 new");
	// The tab bar on a phone, the top bar on a wider screen.
	await expect(
		page.locator(
			'.tabbar a[href="/loans"] .tabbar-badge:visible, .nav-main a[href="/loans"] .nav-badge:visible',
		),
	).toHaveCount(1);

	await page.goto(`/loans/${loan.loanId}`);
	await page.goto("/loans");
	await expect(row.locator(".badge-unread")).toHaveCount(0);

	await putItBack(request, loan);
});
