import { expect, test } from "@playwright/test";

/** A form sends once, and says so, until its answer arrives. */
test("locks a submitted form until the next page arrives", async ({ page }) => {
	await page.goto("/");
	// The guard is a client island: wait until it is listening.
	await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");

	let sent = 0;
	await page.route(/\/\?q=/, async (route) => {
		sent += 1;
		await route.continue();
	});

	await page.locator("form.search input").fill("Oz");
	// Submitted, then submitted again straight away: the double tap.
	const busy = await page.evaluate(() => {
		const form = document.querySelector<HTMLFormElement>("form.search")!;
		form.requestSubmit();
		const locked = form.getAttribute("aria-busy");
		form.requestSubmit();
		return locked;
	});
	expect(busy).toBe("true");

	await expect(page).toHaveURL(/\?q=Oz/);
	await expect(page.locator("form.search")).not.toHaveAttribute(
		"aria-busy",
		"true",
	);
	expect(sent).toBe(1);
});
