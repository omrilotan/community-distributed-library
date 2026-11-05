import { expect, test } from "@playwright/test";
import {
	BORROWER,
	OWNER,
	aLoanInProgress,
	asMember,
	putItBack,
} from "./library.ts";

/** A time proposed for a handoff goes into the member's own calendar. */
test("offers a proposed handoff to Google and to every other calendar", async ({
	page,
	request,
}) => {
	const loan = await aLoanInProgress(request);
	await asMember(request, OWNER.id, `/v1/loans/${loan.loanId}/accept`, {});
	const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
	const proposed = await asMember(
		request,
		BORROWER.id,
		`/v1/loans/${loan.loanId}/handoff/propose`,
		{ day, period: "afternoon" },
	);
	expect(proposed.status).toBeLessThan(300);

	await page.goto(`/loans/${loan.loanId}`);
	const links = page.locator(".handoff .calendar-links");
	await expect(links).toHaveCount(1);

	const google = new URL(
		(await links
			.locator('a[href^="https://calendar.google.com"]')
			.getAttribute("href"))!,
	);
	expect(google.searchParams.get("action")).toBe("TEMPLATE");
	expect(google.searchParams.get("dates")).toMatch(
		new RegExp(
			`^${day.replaceAll("-", "")}T\\d{6}Z/${day.replaceAll("-", "")}T\\d{6}Z$`,
		),
	);
	expect(google.searchParams.get("text")).toContain("Layout Test");

	const file = await page.request.get(`/api/loans/${loan.loanId}/calendar`);
	expect(file.status()).toBe(200);
	expect(file.headers()["content-type"]).toContain("text/calendar");
	const ics = await file.text();
	expect(ics).toContain("BEGIN:VEVENT");
	expect(ics).toContain(`DTSTART:${day.replaceAll("-", "")}T`);

	await putItBack(request, loan);
});

/** Once the time is agreed, the loan stops asking when and where. */
test("a loan with an agreed time no longer asks to arrange it", async ({
	page,
	request,
}) => {
	const loan = await aLoanInProgress(request);
	await asMember(request, OWNER.id, `/v1/loans/${loan.loanId}/accept`, {});
	const day = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
	await asMember(
		request,
		BORROWER.id,
		`/v1/loans/${loan.loanId}/handoff/propose`,
		{ day, period: "evening" },
	);
	const agreed = await asMember(
		request,
		OWNER.id,
		`/v1/loans/${loan.loanId}/handoff/confirm`,
		{},
	);
	expect(agreed.status).toBeLessThan(300);

	await page.goto(`/loans/${loan.loanId}`);
	await expect(page.locator(".chat-head .badge")).toHaveText(
		"accepted — meeting set",
	);
	await expect(page.locator(".chat-log")).toContainText(
		"No messages yet. Write here if anything changes.",
	);
	await expect(page.locator(".chat-log")).not.toContainText(
		"Say when and where",
	);

	await putItBack(request, loan);
});
