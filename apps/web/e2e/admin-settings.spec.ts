import { expect, test } from "@playwright/test";
import { BORROWER, CORE, OWNER, asMember, goToSection } from "./library.ts";

/** The library's settings are the admin's; a saved change shows at once. */
test.describe("the library's settings", () => {
	// The library as it was, put back however the tests end: a failed one
	// must not leave the next run, or the rest of the suite, a changed library.
	let original: Record<string, unknown> | null = null;

	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "admin",
		});
		original = (await asMember(request, BORROWER.id, "/v1/admin/settings"))
			.body;
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		if (original) {
			const { centre: _, ...settings } = original;
			await request.fetch(`${CORE}/v1/admin/settings`, {
				method: "PATCH",
				headers: {
					"X-Member-Id": BORROWER.id,
					"content-type": "application/json",
				},
				data: settings,
			});
		}
		await asMember(request, OWNER.id, `/v1/admin/members/${BORROWER.id}/role`, {
			role: "member",
		});
		await request.dispose();
	});

	test("sets the language a visitor gets", async ({ page, browser }) => {
		await page.goto("/admin/settings");
		await page.locator("#defaultLocale").selectOption("he");
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page).toHaveURL(/saved=1/);

		// Somebody who never chose: the library's language. A choice still wins.
		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
		});
		const fresh = await visitor.newPage();
		await fresh.goto("/about");
		await expect(fresh.locator("html")).toHaveAttribute("lang", "he");
		await fresh.goto("/about?lang=en");
		await expect(fresh.locator("html")).toHaveAttribute("lang", "en");
		await visitor.close();

		// Back to English for the rest of the suite.
		await page.goto("/admin/settings");
		await page.locator("#defaultLocale").selectOption("en");
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page).toHaveURL(/saved=1/);
	});

	test("writes how the library introduces itself, per language", async ({
		page,
		browser,
	}) => {
		await page.goto("/admin/settings");
		// Typed before hydration, a textarea is reset to what the server sent.
		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		const tagline = page.locator("#text-en-tagline");
		const before = await tagline.inputValue();
		await tagline.fill("Neighbours lending each other the shed.");
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page).toHaveURL(/saved=1/);
		await expect(page.locator("#text-en-tagline")).toHaveValue(
			"Neighbours lending each other the shed.",
		);
		// The Hebrew words are untouched by an English change.
		await expect(page.locator("#text-he-name")).not.toHaveValue("");

		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
		});
		const fresh = await visitor.newPage();
		await fresh.goto("/?lang=en");
		await expect(fresh.locator(".guest-lede")).toHaveText(
			"Neighbours lending each other the shed.",
		);
		await visitor.close();

		// Put it back as it was.
		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		await page.locator("#text-en-tagline").fill(before);
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page.locator("#text-en-tagline")).toHaveValue(before);
	});

	test("gives the library a short name for tight spaces", async ({ page }) => {
		const save = async (value: string) => {
			await page.goto("/admin/settings");
			await expect(page.locator("html")).toHaveAttribute(
				"data-form-guard",
				"on",
			);
			await page.locator("#text-en-shortName").fill(value);
			await page.locator(".settings-form button[type='submit']").click();
			await expect(page).toHaveURL(/saved=1/);
		};
		await save("Books");
		try {
			await expect(page.locator(".brand-short")).toHaveText("Books");
			const manifest = await (
				await page.request.get("/manifest.webmanifest")
			).json();
			expect(manifest.short_name).toBe("Books");
		} finally {
			await save("");
		}
		await expect(page.locator(".brand-short")).toHaveText("Library");
	});

	test("offers one language, and the switch goes", async ({
		page,
		browser,
	}) => {
		const choose = async (languages: string) => {
			await page.goto("/admin/settings");
			await page.locator("#languages").selectOption(languages);
			await page.locator("#defaultLocale").selectOption("en");
			await page.locator(".settings-form button[type='submit']").click();
			await expect(page).toHaveURL(/saved=1/);
		};
		await choose("en");
		try {
			const visitor = await browser.newContext({
				storageState: { cookies: [], origins: [] },
			});
			const fresh = await visitor.newPage();
			// Asking for Hebrew gets the library's language, and no way to switch.
			await fresh.goto("/about?lang=he");
			await expect(fresh.locator("html")).toHaveAttribute("lang", "en");
			await expect(fresh.locator("a[href^='/locale/']")).toHaveCount(0);
			await expect(fresh.locator("link[hreflang]")).toHaveCount(0);
			await visitor.close();
		} finally {
			await choose("en,he");
		}
		const visitor = await browser.newContext({
			storageState: { cookies: [], origins: [] },
		});
		const fresh = await visitor.newPage();
		await fresh.goto("/about?lang=he");
		await expect(fresh.locator("html")).toHaveAttribute("lang", "he");
		await visitor.close();
	});

	test("sets how far the library reaches", async ({ page }) => {
		await page.goto("/admin/settings");
		const radius = page.locator("#radiusM");
		const before = await radius.inputValue();
		await radius.selectOption(before === "500" ? "1000" : "500");
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page).toHaveURL(/saved=1/);
		await expect(page.locator("#radiusM")).not.toHaveValue(before);
		await expect(page.locator("#areaLabel")).toBeVisible();
		// Put it back as it was.
		await page.locator("#radiusM").selectOption(before);
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page.locator("#radiusM")).toHaveValue(before);
	});

	test("dresses the library in its own colour, and back", async ({ page }) => {
		const accent = () =>
			page.evaluate(() =>
				getComputedStyle(document.documentElement)
					.getPropertyValue("--accent")
					.trim(),
			);
		const save = async () => {
			await page.locator(".settings-form button[type='submit']").click();
			await expect(page).toHaveURL(/saved=1/);
		};
		const pick = (value: string) =>
			page.locator(`input[name='accentPick'][value='${value}']`);
		await page.goto("/admin/settings");
		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		const house = await accent();
		// The house green is the one ticked, by its name.
		await expect(pick("house")).toBeChecked();
		await expect(
			page.locator(".accent-swatch", { has: pick("house") }),
		).toContainText("Green Sea");

		// A named colour, picked by its name.
		await page.locator(".accent-swatch", { hasText: "Pomegranate" }).click();
		await save();
		await expect(pick("#c0392b")).toBeChecked();

		// Its own colour: changing the colour picks it, once the page's
		// script is running (without one, the option is ticked by hand).
		await expect(async () => {
			await page.locator("input[name='accentOwn']").fill("#3366ff");
			await expect(pick("own")).toBeChecked({ timeout: 500 });
		}).toPass();
		await save();
		await expect(pick("own")).toBeChecked();
		await expect(page.locator("input[name='accentOwn']")).toHaveValue(
			"#3366ff",
		);
		// Darkened where it has to be, so white words on a button still read.
		await page.emulateMedia({ colorScheme: "light" });
		expect(await accent()).toBe("#0f4bff");
		// The installed app's bars and its icons follow.
		await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
			"content",
			"#3366ff",
		);
		await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
			"href",
			"/apple-touch-icon.png?v=3366ff",
		);
		expect(await (await page.request.get("/icon.svg")).text()).toContain(
			'fill="#3366ff"',
		);
		const manifest = await (
			await page.request.get("/manifest.webmanifest")
		).json();
		expect(manifest.theme_color).toBe("#3366ff");
		const png = await page.request.get(manifest.icons[0].src);
		expect(png.headers()["content-type"]).toBe("image/png");
		// An address naming its colour serves that colour, and for good.
		expect(png.headers()["cache-control"]).toContain("immutable");

		await pick("house").check();
		await save();
		expect(await accent()).toBe(house);
		await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
			"content",
			"#16a085",
		);
		await expect(pick("house")).toBeChecked();
	});

	test("saves the default loan length", async ({ page }) => {
		await page.goto("/admin");
		await goToSection(page, "/admin/settings");
		const days = page.locator("#loanDays");
		const before = await days.inputValue();
		await days.fill(before === "21" ? "22" : "21");
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page).toHaveURL(/saved=1/);
		await expect(page.locator("#loanDays")).not.toHaveValue(before);
		// Put it back as it was.
		await page.locator("#loanDays").fill(before);
		await page.locator(".settings-form button[type='submit']").click();
		await expect(page.locator("#loanDays")).toHaveValue(before);
	});

	test("can say everyone lives close by, and the area goes", async ({
		page,
	}) => {
		const choose = async (value: "0" | "1") => {
			await page.goto("/admin/settings");
			await page.locator("#compact").selectOption(value);
			await page.locator(".settings-form button[type='submit']").click();
			await expect(page).toHaveURL(/saved=1/);
		};
		await choose("1");
		try {
			// Setup asks only for a name; no neighbourhood, no map.
			await page.goto("/start/setup");
			await expect(page.locator("#displayName")).toBeVisible();
			await expect(page.locator("#areaLabel")).toHaveCount(0);
			// The shelves offer no nearest-first and no distance filter.
			await page.goto("/");
			await page.locator("details.filters summary").click();
			await expect(page.getByRole("group", { name: "Distance" })).toHaveCount(
				0,
			);
			await expect(page.getByRole("link", { name: "Nearest" })).toHaveCount(0);
		} finally {
			await choose("0");
		}
		await page.goto("/start/setup");
		await expect(page.locator("#areaLabel")).toBeVisible();
	});
});
