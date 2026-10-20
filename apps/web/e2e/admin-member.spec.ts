import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember } from "./library.ts";

/**
 * A member's page, reached from the members list: who they are, how they
 * came in, and what they did. The signed-in browser is the borrower, made a
 * moderator for this file.
 */
test.describe("a member's page", () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("opens from the members list", async ({ page }) => {
		await page.goto("/admin/members");
		await page.locator(`a[href="/admin/members/${OWNER.id}"]`).first().click();
		await expect(page).toHaveURL(new RegExp(`/admin/members/${OWNER.id}$`));
		await expect(page.locator(".member-card h2")).toContainText("Dana");
		// Addresses are the admin's; a moderator sees none.
		await expect(page.locator(".facts")).not.toContainText("@");
		await expect(page.locator("main h2")).toHaveCount(5);
	});
});

test.describe("an admin on a member's page", () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "admin",
		});
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("sees the address and can close a member's invite links", async ({
		page,
		request,
	}) => {
		await asMember(request, OWNER.id, "/v1/invites", {});
		await page.goto(`/admin/members/${OWNER.id}`);
		await expect(page.locator(".facts")).toContainText("dana@example.com");
		await page
			.locator('input[name="invites"][value="revoke"] ~ button')
			.click();
		await expect(page).toHaveURL(new RegExp(`/admin/members/${OWNER.id}$`));
		await expect(page.locator("main")).toContainText("None open.");
	});

	test("downloads a member's data for a data request", async ({ page }) => {
		await page.goto(`/admin/members/${OWNER.id}`);
		const saved = page.waitForEvent("download");
		await page.locator(".data-rights form[data-download] button").click();
		const file = await saved;
		expect(file.suggestedFilename()).toBe(`member-${OWNER.id}.json`);
		const text = await (
			await file.createReadStream()
		)
			.toArray()
			.then((chunks) => Buffer.concat(chunks).toString("utf8"));
		expect(JSON.parse(text).member.email).toBe("dana@example.com");
	});
});
