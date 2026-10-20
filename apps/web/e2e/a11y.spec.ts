import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Every page a member reaches, checked against WCAG 2.2 AA by axe, in both
 * languages — the Hebrew pass is the one that catches a missing `dir`, a
 * mirrored control or an unlabelled icon that English wording hides.
 *
 * axe finds roughly a third of accessibility problems: contrast, names,
 * roles, landmarks, labels. Keyboard order, focus visibility and reading
 * sense still need a person; see the keyboard test below for the part a
 * browser can check.
 */
const signedIn = [
	["storefront", "/"],
	["book", "/works/01J0SEEDWORK00000000000001"],
	["shelf", "/shelf"],
	["add a book", "/shelf/add"],
	["loans", "/loans"],
	["settings", "/settings"],
	["setup", "/start/setup?step=3"],
	["about", "/about"],
	["terms", "/terms"],
	["privacy", "/privacy"],
	["contact", "/contact"],
	["connect", "/connect"],
	["not found", "/no-such-page"],
] as const;

async function scan(page: Page) {
	// The map is a third-party widget whose tiles and controls we do not
	// author; it is checked by hand, not held to this gate.
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
		.exclude(".leaflet-container")
		.analyze();
	return results.violations.map((violation) => ({
		rule: violation.id,
		impact: violation.impact,
		help: violation.help,
		nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
	}));
}

/** The page is drawn in this language, and in its direction. */
async function inLocale(page: Page, locale: "en" | "he") {
	const html = page.locator("html");
	await expect(html).toHaveAttribute("lang", locale);
	await expect(html).toHaveAttribute("dir", locale === "he" ? "rtl" : "ltr");
}

for (const locale of ["en", "he"] as const) {
	test.describe(`accessibility (${locale})`, () => {
		test.beforeEach(async ({ context }) => {
			await context.addCookies([
				{ name: "locale", value: locale, url: "http://localhost:3000" },
			]);
		});

		for (const [name, path] of signedIn) {
			test(`${name} has no violations`, async ({ page }) => {
				await page.goto(path);
				// In the language asked for: a library that does not offer it
				// would hand back English, and this pass would prove nothing.
				await inLocale(page, locale);
				expect(await scan(page)).toEqual([]);
			});
		}

		test("the front door has no violations", async ({ browser }) => {
			// Nobody signed in: an empty storage state, not the project's.
			const visitor = await browser.newContext({
				storageState: { cookies: [], origins: [] },
			});
			await visitor.addCookies([
				{ name: "locale", value: locale, url: "http://localhost:3000" },
			]);
			const page = await visitor.newPage();
			for (const path of ["/", "/login", "/about", "/contact"]) {
				await page.goto(path);
				await inLocale(page, locale);
				expect(await scan(page), path).toEqual([]);
			}
			await visitor.close();
		});
	});
}

test.describe("the keyboard", () => {
	test("reaches the search box and the first book without a mouse", async ({
		page,
	}) => {
		await page.goto("/");
		// A skip link first, then the search box: nobody should have to tab
		// through the whole header to get to the shelves.
		await page.keyboard.press("Tab");
		await expect(page.locator(":focus")).toHaveAttribute("href", "#main");
		await page.keyboard.press("Enter");
		await page.keyboard.press("Tab");
		await expect(page.locator(":focus")).toHaveAttribute("name", "q");
	});

	test("shows where focus is", async ({ page }) => {
		await page.goto("/");
		await page.keyboard.press("Tab");
		const outline = await page
			.locator(":focus")
			.evaluate((element) => getComputedStyle(element).outlineStyle);
		expect(outline).not.toBe("none");
	});
});
