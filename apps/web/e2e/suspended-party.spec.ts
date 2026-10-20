import { expect, test } from "@playwright/test";
import {
	BORROWER,
	OWNER,
	aLoanInProgress,
	asMember,
	putItBack,
} from "./library.ts";

/**
 * When the other side of a loan is suspended, the loan page says so, takes
 * the message box and the nudge away, and points to the moderators.
 */
test("a loan with a suspended member points to the moderators", async ({
	page,
	request,
}) => {
	const loan = await aLoanInProgress(request);
	// Only another admin can suspend the owner: make the borrower one for now.
	await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
		role: "admin",
	});
	try {
		const suspended = await asMember(
			request,
			BORROWER.id,
			`/v1/admin/members/${OWNER.id}/status`,
			{ status: "suspended" },
		);
		expect(suspended.status).toBe(204);

		await page.goto(`/loans/${loan.loanId}`);
		const note = page.locator(".suspended-note");
		await expect(note).toBeVisible();
		await expect(note.locator("h2")).toContainText("is suspended");
		await expect(page.locator("form.composer")).toHaveCount(0);
		await expect(
			page.locator("form input[name='action'][value='nudge']"),
		).toHaveCount(0);
		// The way to the moderators is open and ready.
		await expect(page.locator("details.report")).toHaveAttribute("open", "");
		await note.getByRole("link").click();
		await expect(page.locator("details.report select")).toBeVisible();
	} finally {
		await asMember(
			request,
			BORROWER.id,
			`/v1/admin/members/${OWNER.id}/status`,
			{ status: "active" },
		);
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
	}

	// In good standing again: the message box is back.
	await page.goto(`/loans/${loan.loanId}`);
	await expect(page.locator(".suspended-note")).toHaveCount(0);
	await expect(page.locator("form.composer")).toBeVisible();
	await putItBack(request, loan);
});

/** The moderators see a suspended member's loan, and close it themselves. */
test("moderators settle a suspended member's loan", async ({
	page,
	request,
}) => {
	const loan = await aLoanInProgress(request);
	await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
		role: "admin",
	});
	try {
		await asMember(
			request,
			BORROWER.id,
			`/v1/admin/members/${OWNER.id}/status`,
			{
				status: "suspended",
			},
		);
		await page.goto("/admin");
		const card = page.locator("article.card", {
			has: page.locator(`form[action='/api/admin/loans/${loan.loanId}']`),
		});
		await expect(card).toBeVisible();
		await expect(card.locator(".badge")).toContainText("is suspended");
		// Not handed over yet: the one way to settle it is to call it off.
		await card.getByRole("button", { name: "Call it off" }).click();
		await expect(page).toHaveURL(/settled=1/);
		await expect(
			page.locator(`form[action='/api/admin/loans/${loan.loanId}']`),
		).toHaveCount(0);
	} finally {
		await asMember(
			request,
			BORROWER.id,
			`/v1/admin/members/${OWNER.id}/status`,
			{
				status: "active",
			},
		);
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
	}
	const closed = await asMember(request, BORROWER.id, "/v1/me/loans");
	const mine = [...closed.body.borrowing].find(
		(entry: { id: string }) => entry.id === loan.loanId,
	);
	expect(mine.status).toBe("cancelled");
	await putItBack(request, loan);
});
