import {
	expect,
	test,
	type APIRequestContext,
	type Page,
} from "@playwright/test";
import { BORROWER, CORE, asMember } from "./library.ts";

/** Closes the page as a tap on a link would, and says whether the browser asked first. */
async function leaving(page: Page): Promise<"asked" | "quiet"> {
	// A page that goes without asking closes, and the wait ends with it.
	const asked = page
		.waitForEvent("dialog")
		.then(async (dialog) => {
			await dialog.dismiss();
			return dialog.type() === "beforeunload"
				? ("asked" as const)
				: ("quiet" as const);
		})
		.catch(() => "quiet" as const);
	await page.close({ runBeforeUnload: true });
	return asked;
}

/** An edit not yet saved is not lost to a stray tap: the browser asks first. */
test.describe("the settings page", () => {
	test("asks before leaving with an unsaved change", async ({ page }) => {
		await page.goto("/settings");
		// Hydrated, so the guard is listening; a real keystroke, so the browser
		// counts the page as interacted with and will show its dialog.
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await page.locator("#displayName").click();
		await page.keyboard.type(" x");
		expect(await leaving(page)).toBe("asked");
	});

	test("lets an untouched page go quietly", async ({ page }) => {
		await page.goto("/settings");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		expect(await leaving(page)).toBe("quiet");
	});
});

/**
 * One Save for the whole profile, the fields after the invitations
 * included: they join the form by its id.
 */
test("saves every field with the one button", async ({ page }) => {
	const me = () => asMember(page.request, BORROWER.id, "/v1/me");
	const before = (await me()).body;
	const hadMet = (
		await asMember(page.request, BORROWER.id, "/v1/me/availability")
	).body;
	await page.goto("/settings");
	await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
	// One button saves the profile; the invitation's acts on its own.
	await expect(
		page.locator(
			"#profile button[type=submit], button[type=submit][form=profile]",
		),
	).toHaveCount(1);
	await page.locator("#lendLimit").fill("97");
	await page.locator("#meetingPlace").fill("By the blue gate");
	await page.locator(".profile-save").click();
	await expect(page).toHaveURL(/\/settings\?saved=1/);
	expect((await me()).body.lendLimit).toBe(97);
	expect((await me()).body.displayName).toBe(before.displayName);
	const met = await asMember(page.request, BORROWER.id, "/v1/me/availability");
	expect(met.body.meetingPlace).toBe("By the blue gate");

	await page.request.fetch(`${CORE}/v1/me`, {
		method: "PATCH",
		headers: { "X-Member-Id": BORROWER.id },
		data: { lendLimit: before.lendLimit ?? null },
	});
	await page.request.put(`${CORE}/v1/me/availability`, {
		headers: { "X-Member-Id": BORROWER.id },
		data: hadMet,
	});
});

/** Withdraws every link the member has out that nobody has used. */
async function withdrawAll(request: APIRequestContext) {
	const mine = await asMember(request, BORROWER.id, "/v1/me/invites");
	for (const one of mine.body.invites as { id: string; joined: unknown[] }[])
		if (one.joined.length === 0)
			await asMember(
				request,
				BORROWER.id,
				`/v1/me/invites/${one.id}/revoke`,
				{},
			);
}

/** One neighbour at a time: after a link, the next is one tap away. */
test.describe("invites", () => {
	// Five open links is the cap; start and end with none.
	test.beforeEach(({ request }) => withdrawAll(request));
	test.afterEach(({ request }) => withdrawAll(request));

	test("offers another link once one is made", async ({ page }) => {
		await page.goto("/settings#invite");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		const invite = page.locator("#invite");
		await invite.getByRole("button", { name: "Make an invite link" }).click();
		const link = invite.locator(".token-created code");
		await expect(link).toHaveText(/^https?:\/\//);
		const first = await link.textContent();

		await invite.getByRole("button", { name: "Make another link" }).click();
		await expect(link).not.toHaveText(first!);
		await expect(link).toHaveText(/^https?:\/\//);
	});

	test("makes a link without a script, and shows it once", async ({
		browser,
	}) => {
		const plain = await browser.newContext({
			storageState: "e2e/.auth/borrower.json",
			javaScriptEnabled: false,
		});
		const page = await plain.newPage();
		await page.goto("/settings#invite");
		const invite = page.locator("#invite");
		await invite.getByRole("button", { name: "Make an invite link" }).click();
		await expect(page).toHaveURL(/\/settings/);
		// Never in the address, where history would keep it.
		expect(page.url()).not.toContain("invite=");
		await expect(invite.locator(".token-created code")).toHaveText(
			/^https?:\/\//,
		);
		// Shown once: gone on the next view.
		await page.reload();
		await expect(invite.locator(".token-created code")).toHaveCount(0);
		await plain.close();
	});
});
