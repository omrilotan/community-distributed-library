import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { BORROWER, CORE, OWNER, asMember } from "./library.ts";

/**
 * A library of things, end to end: the words, adding a thing with its
 * details, and borrowing part of a set. The local library is switched to
 * things for this file only (the "things" project runs it last).
 */
const lends = (
	request: import("@playwright/test").APIRequestContext,
	type: string,
) => request.post(`${CORE}/v1/dev/library-type`, { data: { type } });

/** What asks say is said of things: no books, covers or ISBNs. */
const noBookWords = async (part: Locator) =>
	expect(await part.innerText()).not.toMatch(/\bbooks?\b|\bcovers?\b|ISBN/i);

/** The rules a page breaks, by name: WCAG 2.2 AA, as a11y.spec.ts checks the rest. */
const axe = async (page: Page) =>
	(
		await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
			.analyze()
	).violations.map((violation) => violation.id);

test.describe("a library of things", () => {
	test.beforeAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		expect((await lends(request, "things")).status()).toBe(204);
		await request.dispose();
	});

	test.afterAll(async ({ playwright }) => {
		const request = await playwright.request.newContext();
		await lends(request, "books");
		await request.dispose();
	});

	test("speaks of things, and adds one with its details", async ({ page }) => {
		await page.goto("/shelf/add");
		await expect(page.locator("h1")).toHaveText("Add a thing");
		await expect(
			page.locator("nav a:visible", { hasText: "My things" }),
		).toHaveCount(1);
		await expect(page.locator("#isbn13")).toHaveCount(0);

		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		const name = `Ladder ${Date.now()}`;
		await page.locator("#name").fill(name);
		await page.locator("#brand").fill("Werner");
		await page.locator("#needs").fill("A second pair of hands");
		await page.locator("#link").fill("https://www.wernerco.com/ladders");
		await page.locator("input[value='category:tools']").check({ force: true });
		await page
			.locator("form[action='/api/copies'] button[type=submit]")
			.click();
		await expect(page).toHaveURL(/\/shelf\?added=/);

		const shelf = await asMember(page.request, BORROWER.id, "/v1/me/shelf");
		const mine = shelf.body.copies.find(
			(copy: { title: string }) => copy.title === name,
		);
		expect(mine).toBeTruthy();
		const detail = await asMember(
			page.request,
			BORROWER.id,
			`/v1/copies/${mine.id}`,
		);
		expect(detail.body.details).toEqual({
			brand: "Werner",
			needs: "A second pair of hands",
			link: "https://www.wernerco.com/ladders",
		});
		// The product page is somebody else's site: said so, opened apart.
		await page.goto(`/works/${detail.body.work.id}`);
		const link = page.locator(".thing-link a");
		await expect(link).toHaveAttribute(
			"href",
			"https://www.wernerco.com/ladders",
		);
		await expect(link).toHaveAttribute("target", "_blank");
		await expect(link).toHaveAttribute("rel", /noopener.*nofollow.*external/);
		await expect(page.locator(".thing-link")).toContainText(
			"on an outside website: www.wernerco.com",
		);
		expect(detail.body.work.tags).toEqual(["category:tools"]);
		await page.request.fetch(`${CORE}/v1/copies/${mine.id}`, {
			method: "DELETE",
			headers: { "X-Member-Id": BORROWER.id },
		});
	});

	test("tells about the library, its terms and privacy without books", async ({
		browser,
	}) => {
		for (const locale of ["en", "he"]) {
			const context = await browser.newContext();
			await context.addCookies([
				{ name: "locale", value: locale, url: "http://localhost:3000" },
			]);
			const page = await context.newPage();
			for (const path of ["/about", "/terms", "/privacy"]) {
				await page.goto(path);
				// The library's own about text is its admin's words, not the code's.
				const own = page.locator(".about-head p.muted");
				const theirs = (await own.count()) ? await own.innerText() : "";
				const text = (await page.locator("main").innerText()).replace(
					theirs,
					"",
				);
				// "Library" stays; books, covers and ISBNs do not.
				expect(text, `${locale} ${path}`).not.toMatch(
					/\bbooks?\b|\bcovers?\b|ISBN|ספר(?!י)|ספרים|כריכ|מסת״ב/i,
				);
			}
			// Tools and gear can injure: the terms say so in either language.
			await page.goto("/terms");
			await expect(page.locator("main")).toContainText(
				locale === "he"
					? "כלים וציוד עלולים לגרום לפציעה"
					: "Tools and gear can injure people",
			);
			await context.close();
		}
	});

	test("takes up to four square photos, padding one that is not square", async ({
		page,
	}) => {
		await page.goto("/shelf/add");
		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		await expect(page.locator("html")).toHaveAttribute(
			"data-library",
			"things",
		);
		const name = `Gazebo ${Date.now()}`;
		await page.locator("#name").fill(name);
		await page
			.locator(".photos-picker input[type=file][accept]")
			.setInputFiles([
				fileURLToPath(new URL("./fixtures/portrait.png", import.meta.url)),
				fileURLToPath(new URL("./fixtures/landscape.png", import.meta.url)),
			]);
		const squares = page.locator(".photos-slots canvas");
		await expect(squares).toHaveCount(2);
		// A photo a little off square has a fractional least zoom (0.952…);
		// its slider must still pass the form's own check, or Save is blocked.
		await page
			.locator(".photos-picker input[type=file][accept]")
			.setInputFiles([
				fileURLToPath(new URL("./fixtures/near-square.png", import.meta.url)),
			]);
		await expect(squares).toHaveCount(3);
		const sliders = page.locator(".photos-slots input[type=range]");
		for (const slider of await sliders.all())
			expect(
				await slider.evaluate((input) =>
					(input as HTMLInputElement).checkValidity(),
				),
			).toBe(true);
		// The tall photo starts whole in its square: white at the sides, red in the middle.
		const pixel = (x: number, y: number) =>
			squares.first().evaluate(
				(canvas, [px, py]) => {
					const c = canvas as HTMLCanvasElement;
					const data = c
						.getContext("2d")!
						.getImageData(px! * c.width, py! * c.height, 1, 1).data;
					return [data[0], data[1], data[2]];
				},
				[x, y],
			);
		// The square is drawn once the photo has decoded, which a cold server
		// can leave until after the square is on the page.
		await expect.poll(() => pixel(0.05, 0.5)).toEqual([255, 255, 255]);
		const middle = await pixel(0.5, 0.5);
		expect(middle[0]).toBeGreaterThan(150);
		expect(middle[2]).toBeLessThan(100);
		await expect(page.locator(".photos-slots .badge")).toHaveText("Main photo");

		await page
			.locator("form[action='/api/copies'] button[type=submit]")
			.click();
		await expect(page).toHaveURL(/\/shelf\?added=/);

		const shelf = await asMember(page.request, BORROWER.id, "/v1/me/shelf");
		const mine = shelf.body.copies.find(
			(copy: { title: string }) => copy.title === name,
		);
		const detail = await asMember(
			page.request,
			BORROWER.id,
			`/v1/copies/${mine.id}`,
		);
		expect(detail.body.photos).toHaveLength(3);
		// Saved as squares, whatever shape they came in.
		for (const url of detail.body.photos as string[]) {
			const size = await page.evaluate(async (src) => {
				const image = new Image();
				image.src = src;
				await image.decode();
				return [image.naturalWidth, image.naturalHeight];
			}, url);
			expect(size).toEqual([1000, 1000]);
		}
		// The page shows the first beside its name and the other below.
		await page.goto(`/works/${detail.body.work.id}`);
		await expect(page.locator(".thing-photos img")).toHaveCount(2);
		// Each opens the photo whole, and says which photo it is.
		await expect(page.locator(".thing-photos a").first()).toHaveAccessibleName(
			"Photo 2",
		);

		// On its own page the last photo can be moved to the front.
		const before = detail.body.photos as string[];
		await page.goto(`/shelf/${mine.id}`);
		await expect(page.locator("html")).toHaveAttribute("data-form-guard", "on");
		const slots = page.locator(".photos-slots > li:has(.photos-move)");
		await expect(slots).toHaveCount(3);
		// Only the moves there are: the first goes no earlier.
		await expect(
			slots.first().getByRole("button", { name: "Move earlier" }),
		).toHaveCount(0);
		await slots.nth(2).getByRole("button", { name: "Move earlier" }).click();
		await slots.nth(1).getByRole("button", { name: "Move earlier" }).click();
		await expect(slots.first().locator("img")).toHaveAttribute(
			"src",
			before[2]!,
		);
		await expect(slots.first().locator(".badge")).toHaveText("Main photo");
		// One taken out stays where it was, dimmed, until it is put back; out,
		// it makes room for another.
		const status = page.locator(".photos-picker [role=status]");
		await expect(status).toHaveText("One more photo fits.");
		await slots.nth(2).getByRole("button", { name: "Remove" }).click();
		await expect(page.locator(".photos-out")).toHaveCount(1);
		await expect(status).toHaveText("Up to 2 more.");
		await page
			.locator(".photos-out")
			.getByRole("button", { name: "Keep" })
			.click();
		await expect(page.locator(".photos-out")).toHaveCount(0);
		await slots.nth(2).getByRole("button", { name: "Remove" }).click();
		await page
			.locator(`form[action='/api/copies/${mine.id}'] button[type=submit]`)
			.click();
		await expect(page.getByText("Saved.")).toBeVisible();
		const moved = await asMember(
			page.request,
			BORROWER.id,
			`/v1/copies/${mine.id}`,
		);
		expect(moved.body.photos).toEqual([before[2], before[0]]);

		await page.request.fetch(`${CORE}/v1/copies/${mine.id}`, {
			method: "DELETE",
			headers: { "X-Member-Id": BORROWER.id },
		});
	});

	test("asks the neighbours, and takes an offer that becomes a loan", async ({
		page,
	}) => {
		const what = `Saw ${Date.now()}`;
		await page.goto(`/?q=${encodeURIComponent(what)}`);
		// Nothing found: the ask form is open, carrying the words searched for.
		const form = page.locator("form[action='/api/asks']");
		await expect(form).toBeVisible();
		await expect(form.locator("#ask-what")).toHaveValue(what);
		await form.locator("#ask-note").fill("Hand saw or small chainsaw");
		await form.locator("input[name=by][value=week]").check({ force: true });
		await form.locator("button[type=submit]").click();
		await expect(page).toHaveURL(/\/loans\?asked=1/);
		const card = page.locator("#asks .ask-card", { hasText: what });
		await expect(card).toContainText("No offers yet");
		await noBookWords(page.locator("#asks"));

		const asks = await asMember(page.request, OWNER.id, "/v1/asks");
		const ask = asks.body.asks.find(
			(one: { what: string }) => one.what === what,
		);
		expect(ask).toMatchObject({ by: "week", days: 1, mine: false });
		const offered = await asMember(
			page.request,
			OWNER.id,
			`/v1/asks/${ask.id}/offers`,
			{
				name: "Hand saw",
				come: "now",
				time: "18:00",
				note: "Top bell",
				meetingPlace: "12 Elm Road",
			},
		);
		expect(offered.status).toBe(201);

		await page.reload();
		await expect(card).toContainText("1 neighbour has one");
		expect(await axe(page), "loans, with an ask and its offer").toEqual([]);
		await expect(card).toContainText("Come by until 18:00");
		await expect(card).toContainText("Top bell");
		await card.locator("form[action$='/take'] button").click();
		// The offer is a loan now, with where to come and what was said.
		await expect(page).toHaveURL(/\/loans\/[0-9A-Z]{26}/);
		// (Named in the heading, or in the list when Dana lends Sam more at once.)
		await expect(page.locator("main")).toContainText("Hand saw");
		await expect(page.locator("main")).toContainText("Come by until 18:00");
		const loanId = new URL(page.url()).pathname.split("/").pop()!;
		// It is on no shelf.
		await page.goto("/?q=Hand+saw");
		await expect(page.locator("#listing")).not.toContainText("Hand saw");
		await asMember(page.request, BORROWER.id, `/v1/loans/${loanId}/cancel`, {});
	});

	test("offers what a neighbour asked for, from the front page", async ({
		page,
	}) => {
		const what = `Ladder ${Date.now()}`;
		const asked = await asMember(page.request, OWNER.id, "/v1/asks", {
			what,
			by: "today",
			days: 1,
		});
		expect(asked.status).toBe(201);

		await page.goto("/");
		const row = page.locator(".asks li", { hasText: what });
		await expect(row).toContainText("Today");
		expect(await axe(page), "the front page, with an ask").toEqual([]);
		await row.locator("a.btn").click();
		await expect(page).toHaveURL(new RegExp(`/asks/${asked.body.id}`));
		await expect(page.locator("h1")).toHaveText("Offer yours");
		await noBookWords(page.locator("main"));
		await expect(page.locator("#offer-name")).toHaveValue(what);
		expect(await axe(page), "the offer form").toEqual([]);

		await page.locator("#offer-name").fill("Step ladder");
		await page.locator("input[name=come][value=later]").check();
		await page.locator("input[name=from]").fill("17:30");
		if (await page.locator("#offer-place").count())
			await page.locator("#offer-place").fill("3 Oak Lane");
		await page.locator(".offer-form button[type=submit]").click();
		await expect(page).toHaveURL(/offered=1/);
		await expect(page.locator("main")).toContainText("You offered yours");
		await expect(page.locator("main")).toContainText("Today from 17:30");

		// The asker sees it; closing the ask ends it for both.
		const theirs = await asMember(page.request, OWNER.id, "/v1/me/asks");
		expect(theirs.body.asks[0].offers).toEqual([
			expect.objectContaining({ name: "Step ladder", come: "later" }),
		]);
		await asMember(
			page.request,
			OWNER.id,
			`/v1/asks/${asked.body.id}/close`,
			{},
		);
		await page.goto("/");
		await expect(page.locator(".asks li", { hasText: what })).toHaveCount(0);
	});

	test("lends part of a set", async ({ page }) => {
		const listed = await asMember(page.request, OWNER.id, "/v1/copies", {
			thing: { name: `Folding chairs ${Date.now()}`, quantity: 6 },
		});
		expect(listed.status).toBe(201);
		await page.goto(`/works/${listed.body.workId}`);
		await expect(page.locator(".choose-row .badge").first()).toHaveText(
			"6 of 6 free",
		);
		await page.locator("input[name=quantity]").fill("2");
		await page.locator("form.request button[type=submit]").click();
		await expect(page).toHaveURL(/requested=1/);
		// Asked for: the row says so as the asker's, and leads to the loan.
		await expect(page.locator(".choose-row .badge").first()).toHaveText(
			"you asked",
		);
		await expect(
			page.locator(".choose-row a", { hasText: "Your loan" }),
		).toHaveAttribute("href", /^\/loans\/./);
		await expect(page.locator(".waitlist form")).toHaveCount(0);

		await page.goto("/loans");
		await expect(page.getByText("· 2 of 6")).toBeVisible();

		// Put everything back.
		const loans = await asMember(page.request, BORROWER.id, "/v1/me/loans");
		const loan = loans.body.borrowing.find(
			(entry: { copy: { id: string } }) => entry.copy.id === listed.body.id,
		);
		await asMember(
			page.request,
			BORROWER.id,
			`/v1/loans/${loan.id}/cancel`,
			{},
		);
		await page.request.fetch(`${CORE}/v1/copies/${listed.body.id}`, {
			method: "DELETE",
			headers: { "X-Member-Id": OWNER.id },
		});
	});
});
