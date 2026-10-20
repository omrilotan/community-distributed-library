import { expect, test } from "@playwright/test";
import { BORROWER, OWNER, asMember, goToSection } from "./library.ts";

/**
 * Messages to the library are the admin's to read. The signed-in browser is
 * the borrower: first a moderator, who does not see them, then an admin.
 */
test.describe("messages to the library", () => {
	test.describe.configure({ mode: "serial" });
	const body = `Please delete my data ${Date.now()}`;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await request.post(
			`${process.env.CORE_URL ?? "http://localhost:8787"}/v1/contact`,
			{
				data: { topic: "data", body, email: "visitor@example.com" },
			},
		);
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("are not a moderator's", async ({ page, request }) => {
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "moderator",
		});
		await page.goto("/admin");
		await expect(page.locator('.tabs a[href="/admin/messages"]')).toHaveCount(
			0,
		);
		await page.goto("/admin/messages");
		await expect(page.locator(".empty")).toContainText("admin");
	});

	test("are listed for the admin, newest first", async ({ page, request }) => {
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "admin",
		});
		await page.goto("/admin");
		await goToSection(page, "/admin/messages");
		const first = page.locator(".messages-log li").first();
		await expect(first).toContainText(body);
		await expect(first).toContainText("visitor@example.com");
		await first.locator("button").click();
		await expect(page.locator(".messages-log li").first()).toHaveClass(
			/handled/,
		);
	});
});
