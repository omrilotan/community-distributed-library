import { expect, test } from "@playwright/test";

/** Each page names itself, ahead of the library's name (WCAG 2.4.2). */
test("pages are told apart by their titles", async ({ page }) => {
	const titles = new Set<string>();
	for (const path of [
		"/",
		"/loans",
		"/shelf",
		"/shelf/add",
		"/settings",
		"/wishlist",
		"/connect",
		"/contact",
		"/terms",
		"/privacy",
		"/about",
	]) {
		await page.goto(path);
		const title = await page.title();
		expect(title, path).not.toBe("");
		titles.add(title);
	}
	expect(titles.size).toBe(11);
});
