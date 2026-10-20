import { expect, test } from "@playwright/test";
import {
	BORROWER,
	OWNER,
	aLoanInProgress,
	asMember,
	putItBack,
} from "./library.ts";

/**
 * A report is a word with the moderators, placed in the conversation where it
 * happened, with its comment and its time. The other side never sees it.
 */
test("a report sits in the reporter's timeline and nowhere else", async ({
	page,
	request,
}) => {
	const loan = await aLoanInProgress(request);
	const comment = `Waited an hour ${Date.now()}`;

	await page.goto(`/loans/${loan.loanId}?report=1`);
	await page.locator("details.report select").selectOption("no_show");
	await page.locator("details.report input#body").fill(comment);
	await page.locator("details.report button[type='submit']").click();

	const entry = page.locator(".chat-log .report-entry");
	await expect(entry).toHaveCount(1);
	await expect(entry).toContainText(comment);
	await expect(entry).toContainText("You reported this to the moderators");
	await expect(entry.locator("time")).toHaveCount(1);
	await expect(entry.locator(".report-status .badge")).toHaveText("Open");

	// The reporter can write to the moderators under the report.
	await entry
		.locator(".report-reply input[name='body']")
		.fill("It was the second time");
	await entry.locator(".report-reply button").click();
	await expect(entry.locator(".report-replies li")).toContainText(
		"It was the second time",
	);

	// Reporting is not nudging. (A fresh member is asked for their times on
	// any request; that callout is not what this checks.)
	await expect(
		page.locator('.callout:not(:has(a[href="/settings#availability"]))'),
	).toHaveCount(0);

	const theirs = await asMember(
		request,
		OWNER.id,
		`/v1/loans/${loan.loanId}/messages`,
	);
	expect(theirs.body.reports).toEqual([]);
	const mine = await asMember(
		request,
		BORROWER.id,
		`/v1/loans/${loan.loanId}/messages`,
	);
	expect(mine.body.reports).toHaveLength(1);

	await putItBack(request, loan);
});
