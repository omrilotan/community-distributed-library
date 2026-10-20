import { expect, test } from "@playwright/test";
import type { Availability } from "@cdl/contracts";
import { BORROWER, CORE, asMember } from "./library.ts";

/**
 * A new member's setup goes one step at a time, says which of three it is,
 * and each step saves only its own part.
 */
test.describe("first setup", () => {
	let had: Availability;

	test.beforeAll(async ({ request }) => {
		had = (await asMember(request, BORROWER.id, "/v1/me/availability")).body;
		await request.put(`${CORE}/v1/me/availability`, {
			headers: { "X-Member-Id": BORROWER.id },
			data: { slots: [{ weekday: 2, period: "morning" }], meetingPlace: null },
		});
	});

	test.afterAll(async ({ request }) => {
		await request.put(`${CORE}/v1/me/availability`, {
			headers: { "X-Member-Id": BORROWER.id },
			data: had,
		});
	});

	test("takes one thing at a time, and keeps what the other steps set", async ({
		page,
		request,
	}) => {
		await page.goto("/start/setup");
		await expect(page.locator(".setup-progress")).toContainText("Step 1 of 3");

		await page.goto("/start/setup?step=2");
		await expect(page.locator(".setup-progress")).toContainText("Step 2 of 3");
		await page.locator("#meetingPlace").fill("12 Example Road");
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page).toHaveURL(/step=3/);

		// The place step left the ticked times alone.
		const after = (await asMember(request, BORROWER.id, "/v1/me/availability"))
			.body as Availability;
		expect(after.meetingPlace).toBe("12 Example Road");
		expect(after.slots).toEqual([{ weekday: 2, period: "morning" }]);
		await expect(page.locator('input[value="2:morning"]')).toBeChecked();

		await page.locator('input[value="4:evening"]').check({ force: true });
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page).toHaveURL(/\/(\?.*)?$/);

		const final = (await asMember(request, BORROWER.id, "/v1/me/availability"))
			.body as Availability;
		expect(final.meetingPlace).toBe("12 Example Road");
		expect(final.slots).toHaveLength(2);
	});
});

/** The first step should be the easiest: a neighbourhood's name is enough. */
test.describe("first setup's area", () => {
	let area: { label: string; lat: number; lng: number };

	test.beforeAll(async ({ request }) => {
		area = (await asMember(request, BORROWER.id, "/v1/me")).body.area;
	});

	test.afterAll(async ({ request }) => {
		await request.fetch(`${CORE}/v1/me`, {
			method: "PATCH",
			headers: {
				"X-Member-Id": BORROWER.id,
				"content-type": "application/json",
			},
			data: { area },
		});
	});

	test("passes with just a neighbourhood typed", async ({ page, request }) => {
		await page.goto("/start/setup");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await page.locator("#areaLabel").fill("East Finchley");
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page).toHaveURL(/step=2/);
		const me = (await asMember(request, BORROWER.id, "/v1/me")).body;
		expect(me.area.label).toBe("East Finchley");
	});

	test("moves with a newly picked neighbourhood, for a member already placed", async ({
		page,
		request,
	}) => {
		await page.goto("/start/setup");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await page.locator("#areaLabel").fill("Golders Green");
		await page.getByRole("button", { name: "Next" }).click();
		await expect(page).toHaveURL(/step=2/);
		const me = (await asMember(request, BORROWER.id, "/v1/me")).body;
		expect(me.area.label).toBe("Golders Green");
		// Placed by core (postcodes.io, or the library's centre): moved, anyway.
		expect([me.area.lat, me.area.lng]).not.toEqual([area.lat, area.lng]);
	});

	test("is filled in by the device's location, from beside the field", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["geolocation"]);
		await context.setGeolocation({ latitude: 51.6131, longitude: -0.1771 });
		await page.goto("/start/setup");
		await expect(page.locator('.menu a[href*="back="]')).toHaveCount(1);
		await page.locator("#areaLabel").fill("");
		await page
			.locator(".field-with-button")
			.getByRole("button", { name: "Use my location" })
			.click();
		// Named by core from the point; which name depends on the ward.
		await expect(page.locator("#areaLabel")).not.toHaveValue("");
	});
});
