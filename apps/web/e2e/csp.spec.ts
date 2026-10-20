import { expect, test, type Page } from "@playwright/test";

/**
 * The policy is only worth having if the pages still work under it. A blocked
 * script or tile shows up as a console violation, so read them back.
 */
function violations(page: Page): string[] {
	const found: string[] = [];
	page.on("console", (message) => {
		const text = message.text();
		if (/Content Security Policy|Refused to/i.test(text)) found.push(text);
	});
	return found;
}

test.describe("the content security policy", () => {
	test("is sent with every page", async ({ page }) => {
		const response = await page.goto("/");
		const csp = response!.headers()["content-security-policy"];
		expect(csp, "no policy on the page").toBeTruthy();
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toMatch(/script-src [^;]*'nonce-/);
		// Nothing may run because it happens to be inline.
		expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
		// Network errors are reported to a group the browser can find.
		const nel = JSON.parse(response!.headers()["nel"]!);
		const group = JSON.parse(response!.headers()["report-to"]!);
		expect(group.group).toBe(nel.report_to);
	});

	test("lets the browse page run", async ({ page }) => {
		const refused = violations(page);
		await page.goto("/");
		// The menu only gains this once client JavaScript has run.
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		expect(refused).toEqual([]);
	});

	test("lets the map draw its tiles", async ({ page }) => {
		const refused = violations(page);
		await page.goto("/settings");
		// The map sits folded under the neighbourhood field; open it.
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await page.locator(".area-map-more summary").click();
		await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({
			timeout: 15_000,
		});
		expect(refused).toEqual([]);
	});
});
