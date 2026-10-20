import type { APIRequestContext, Page } from "@playwright/test";

export const CORE = process.env.CORE_URL ?? "http://localhost:8787";

/** The two members every environment has: see services/core/scripts/seed.sql. */
export const OWNER = {
	id: "01J0MEMBER00000000000DANA",
	email: "dana@example.com",
};
export const BORROWER = {
	id: "01J0MEMBER0000000000SAM00",
	email: "sam@example.com",
};

/** Core, as a member. `DEV_AUTH` makes the header stand in for a session. */
export async function asMember(
	request: APIRequestContext,
	memberId: string,
	path: string,
	body?: unknown,
) {
	const response = await request.fetch(`${CORE}${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: { "X-Member-Id": memberId, "content-type": "application/json" },
		...(body === undefined ? {} : { data: body }),
	});
	return {
		status: response.status(),
		body: await response.json().catch(() => null),
	};
}

/**
 * Sign the browser in the way a member does: ask for a link, follow it. In
 * development core hands the link back rather than emailing it.
 */
export async function signIn(
	page: Page,
	request: APIRequestContext,
	email: string,
): Promise<void> {
	const asked = await request.post(`${CORE}/v1/auth/magic-link`, {
		data: { email },
	});
	const { debugUrl } = (await asked.json()) as { debugUrl?: string };
	if (!debugUrl) {
		throw new Error(
			"No sign-in link came back. Is the API running with DEV_AUTH?",
		);
	}
	await page.goto(debugUrl);
	// Opening the link spends nothing; the button does.
	await page.locator('form[action="/api/auth/exchange"] button').click();
	// Members land on the books (filters and all); a new one on /start.
	await page.waitForURL(/\/(start)?(\?.*)?$/);
}

/** A live loan with a thread, so there is a message box to look at. */
export async function aLoanInProgress(request: APIRequestContext) {
	const copy = await asMember(request, OWNER.id, "/v1/copies", {
		manual: { title: `Layout Test ${Date.now()}`, authors: ["A Tester"] },
	});
	const loan = await asMember(request, BORROWER.id, "/v1/loans", {
		copyId: copy.body.id,
	});
	return { copyId: copy.body.id as string, loanId: loan.body.id as string };
}

export async function putItBack(
	request: APIRequestContext,
	{ copyId, loanId }: { copyId: string; loanId: string },
) {
	await asMember(request, BORROWER.id, `/v1/loans/${loanId}/cancel`, {});
	await request.fetch(`${CORE}/v1/copies/${copyId}`, {
		method: "DELETE",
		headers: { "X-Member-Id": OWNER.id },
	});
}

/**
 * Forget how a member had the shelves filtered. Filters now live on the
 * member, not only in a cookie, so a test that sets one has to put it back
 * or every later visit to the shelves opens filtered.
 */
export async function forgetFilters(
	request: APIRequestContext,
	memberId = BORROWER.id,
) {
	await request.fetch(`${CORE}/v1/me`, {
		method: "PATCH",
		headers: { "X-Member-Id": memberId, "content-type": "application/json" },
		data: { browsePrefs: null },
	});
}

/**
 * Follow a moderator-area section link. On a phone the sections sit behind
 * the "where you are" line, so open that first.
 */
export async function goToSection(page: Page, href: string) {
	const summary = page.locator(".tabs summary");
	if (await summary.isVisible()) await summary.click();
	await page.locator(`.tabs a[href="${href}"]`).click();
}
