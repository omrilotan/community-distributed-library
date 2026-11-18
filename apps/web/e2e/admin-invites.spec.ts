import { expect, test } from "@playwright/test";
import { copied, watchClipboard } from "./clipboard.ts";
import { BORROWER, CORE, OWNER, asMember } from "./library.ts";

/**
 * A new invite link has to be one press away from the clipboard, and there
 * again for whoever made it while it is live. The signed-in browser is the
 * borrower, made a moderator here.
 */
test.describe("a moderator's invite link", () => {
	test.use({ permissions: ["clipboard-write"] });

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

	test("copies the new link", async ({ page }) => {
		await watchClipboard(page);
		await page.goto("/admin/invites");
		await page.locator('form[action="/api/admin/invites"] button').click();
		// Shown on the page, never carried in its address.
		const block = page.locator(".callout .link-ready");
		await expect(block).toBeVisible();
		expect(page.url()).not.toContain("invite=");
		// The button only works once the client islands have hydrated.
		await expect(page.locator('.menu a[href*="back="]')).not.toHaveCount(0);

		const shown = await block.locator("code").innerText();
		expect(shown).toMatch(/\/join\?invite=/);
		await block.getByRole("button", { name: "Copy link" }).click();
		await expect(
			block.getByRole("button", { name: "Link copied" }),
		).toBeVisible();
		expect(await copied(page)).toBe(shown);
		// Gone on the next view, and never left in the page behind it.
		await page.reload();
		await expect(page.locator(".callout .link-ready")).toHaveCount(0);
		expect(await page.content()).not.toContain(shown);
	});

	test("shows a live link again to the moderator who made it", async ({
		page,
	}) => {
		await page.goto("/admin/invites");
		await page.locator('form[action="/api/admin/invites"] button').click();
		const block = page.locator(".callout .link-ready");
		const shown = await block.locator("code").innerText();
		await page.reload();
		await expect(block).toHaveCount(0);

		// The newest invite is the first row: its link comes back on request.
		await page
			.locator("tbody tr")
			.first()
			.getByRole("button", { name: "Show link" })
			.click();
		await expect(block.locator("code")).toHaveText(shown);
		expect(page.url()).not.toContain("invite=");
		await expect(page.getByText("you can show it again")).toBeVisible();

		// Revoked, it has no link to show.
		await page
			.locator("tbody tr")
			.first()
			.getByRole("button", { name: "Revoke" })
			.click();
		await expect(
			page
				.locator("tbody tr")
				.first()
				.getByRole("button", { name: "Show link" }),
		).toHaveCount(0);
	});

	test("shows the link as a code, and saves it as a picture", async ({
		page,
	}) => {
		await page.goto("/admin/invites");
		await page.locator('form[action="/api/admin/invites"] button').click();
		const block = page.locator(".callout .link-ready");
		await expect(page.locator('.menu a[href*="back="]')).not.toHaveCount(0);
		await block.getByRole("button", { name: "Show QR code" }).click();
		await expect(block.locator(".invite-qr img")).toBeVisible();
		const download = page.waitForEvent("download");
		await block.getByRole("button", { name: "Download PNG" }).click();
		expect((await download).suggestedFilename()).toBe("join-qr.png");
	});

	test("makes a link for one day, says when, and prints it as a sign", async ({
		page,
	}) => {
		await page.goto("/admin/invites");
		const form = page.locator('form[action="/api/admin/invites"]');
		await form.locator('input[name="maxUses"]').fill("50");
		await form.getByLabel("For one day (an event)").check();
		// The time zone is said before the link is made, and after.
		await expect(form).toContainText("Europe/London");
		await form.getByRole("button").click();

		const block = page.locator(".callout .link-ready");
		await expect(block).toContainText(/Works on \w+day \d+ \w+, 00:00/);
		await expect(block).toContainText("Europe/London");
		await expect(
			page.locator("td", { hasText: " only" }).first(),
		).toBeVisible();

		await expect(page.locator('.menu a[href*="back="]')).not.toHaveCount(0);
		await block
			.getByRole("button", { name: "Make a join sign to print" })
			.click();
		await expect(block.locator(".sign-preview")).toBeVisible();
		const download = page.waitForEvent("download");
		await block.getByRole("button", { name: "Download PDF (A4)" }).click();
		const pdf = await download;
		expect(pdf.suggestedFilename()).toBe("join-sign.pdf");
		const path = await pdf.path();
		const { readFile } = await import("node:fs/promises");
		const head = (await readFile(path!)).subarray(0, 8).toString("latin1");
		expect(head).toBe("%PDF-1.4");
	});
});

/** What a link that cannot let anyone in says, and who can invite instead. */
test.describe("a spent or early invite", () => {
	const DAY = 86_400;
	const now = () => Math.floor(Date.now() / 1000);

	test("opens on its day, not before", async ({ browser }) => {
		const page = await browser.newPage();
		const request = page.context().request;
		const made = await asMember(request, OWNER.id, "/v1/admin/invites", {
			maxUses: 30,
			startsAt: now() + 2 * DAY,
			expiresAt: now() + 3 * DAY,
		});
		await page.goto(`/join?invite=${encodeURIComponent(made.body.token)}`);
		await expect(page.locator(".callout")).toContainText(
			"This invite opens on",
		);
		await expect(page.locator('input[name="email"]')).toHaveCount(0);
		await page.close();
	});

	test("tells a used one-person link from a full group's", async ({
		browser,
	}) => {
		const page = await browser.newPage();
		const request = page.context().request;
		for (const [maxUses, says] of [
			[1, "This invite was for one person"],
			[3, "This invite is full: all 3 places have been taken."],
		] as const) {
			const made = await asMember(request, OWNER.id, "/v1/admin/invites", {
				maxUses,
			});
			for (let i = 0; i < maxUses; i++) {
				const email = `full-${maxUses}-${i}-${Date.now()}@example.com`;
				// Each neighbour asks from their own home: sign-in links are
				// rationed by where they are asked from, and the rest of the
				// suite needs this machine's share.
				const asked = await request.fetch(`${CORE}/v1/auth/magic-link`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-cdl-client-ip": `203.0.113.${10 * maxUses + i}`,
					},
					data: { email, invite: made.body.token },
				});
				const { debugUrl } = await asked.json();
				const token = new URL(debugUrl).searchParams.get("token");
				await request.fetch(`${CORE}/v1/auth/exchange`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					data: { token },
				});
			}
			await page.goto(`/join?invite=${encodeURIComponent(made.body.token)}`);
			await expect(page.locator(".callout-warn")).toContainText(says);
			await expect(page.locator("main")).toContainText(
				"Any member of the library can invite you at any time",
			);
		}
		await page.close();
	});
});

/** Straight to an inbox: no link for the moderator to pass on. */
test.describe("a moderator's invitation by email", () => {
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

	test("is sent, and shows who it went to", async ({ page }) => {
		const email = `neighbour-${Date.now()}@example.com`;
		await page.goto("/admin/invites");
		await page.locator('input[name="email"]').fill(email);
		await page.getByRole("button", { name: "Send invitation" }).click();
		await expect(page).toHaveURL(/sent=1/);
		await expect(page.locator(".callout")).toContainText("Invitation sent.");
		await expect(page.locator("td", { hasText: email })).toHaveCount(1);
	});

	test("says so when the address is already a member", async ({ page }) => {
		await page.goto("/admin/invites");
		await page.locator('input[name="email"]').fill("dana@example.com");
		await page.getByRole("button", { name: "Send invitation" }).click();
		await expect(page.locator(".callout-warn")).toContainText(
			"already a member",
		);
	});
});
