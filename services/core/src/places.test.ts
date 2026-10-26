import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { as, SAM } from "../test/api.ts";
import { looksLikePostcode, tidyPostcode } from "./places.ts";

const API = "https://api.postcodes.io";

/**
 * postcodes.io answers, stubbed by path, so nothing leaves the test. A path
 * nobody stubbed answers 404, as the real API does for an unknown place.
 */
function answer(stubs: [RegExp | string, unknown][]) {
	const real = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url = String(input instanceof Request ? input.url : input);
		if (!url.startsWith(API)) return real(input, init);
		const path = url.slice(API.length);
		const hit = stubs.find(([match]) =>
			typeof match === "string" ? path === match : match.test(path),
		);
		return hit ? Response.json(hit[1]) : new Response("{}", { status: 404 });
	});
}
afterEach(() => vi.restoreAllMocks());

describe("postcodes", () => {
	it("are told from place names, and tidied", () => {
		expect(looksLikePostcode("N3 3SS")).toBe(true);
		expect(looksLikePostcode("n33ss")).toBe(true);
		expect(looksLikePostcode("N12")).toBe(true);
		expect(looksLikePostcode("East Finchley")).toBe(false);
		expect(tidyPostcode("n33ss")).toBe("N3 3SS");
		expect(tidyPostcode("n12")).toBe("N12");
	});
});

describe("places", () => {
	it("are suggested nearest the library first, far namesakes left out", async () => {
		answer([
			[
				/^\/places\?q=Totteridge/,
				{
					result: [
						{
							name_1: "Totteridge",
							latitude: 53.5,
							longitude: -2.4,
							district_borough: "Bolton",
							outcode: "BL2",
						},
						{
							name_1: "Totteridge",
							latitude: 51.629,
							longitude: -0.2,
							district_borough: "Barnet",
							outcode: "N20",
						},
					],
				},
			],
		]);
		const { body } = await as(SAM).get("/v1/places?q=Totteridge");
		expect(body.places).toEqual([
			{ name: "Totteridge", lat: 51.629, lng: -0.2, detail: "Barnet" },
		]);
	});

	it("name a point by its ward", async () => {
		answer([
			[
				/^\/postcodes\?lon=/,
				{
					result: [{ admin_ward: "West Finchley", outcode: "N12" }],
				},
			],
		]);
		const { body } = await as(SAM).get("/v1/places/at?lat=51.6131&lng=-0.1771");
		expect(body.name).toBe("West Finchley");
	});

	it("name a point outside the UK from OpenStreetMap, saying who asks", async () => {
		const asked: Request[] = [];
		const real = globalThis.fetch;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			if (request.url.startsWith(API))
				return Response.json({ status: 200, result: null });
			if (request.url.startsWith("https://nominatim.openstreetmap.org/")) {
				asked.push(request);
				return Response.json({
					address: { road: "Golda Meir", suburb: "Ramot", city: "Jerusalem" },
				});
			}
			return real(input, init);
		});
		const { body } = await as(SAM).get("/v1/places/at?lat=31.8167&lng=35.1958");
		expect(body.name).toBe("Ramot");
		expect(asked).toHaveLength(1);
		expect(asked[0]!.headers.get("user-agent")).toContain(
			"community-distributed-library",
		);
		// Rounded, not where the phone is.
		expect(asked[0]!.url).not.toContain("lat=31.8167&");
	});
});

describe("an area saved by name alone", () => {
	it("is placed at a postcode it finds, and at the library's centre otherwise", async () => {
		answer([
			[
				"/outcodes/N2",
				{
					result: {
						latitude: 51.587,
						longitude: -0.165,
						admin_district: ["Barnet"],
					},
				},
			],
		]);
		expect(
			(await as(SAM).patch("/v1/me", { area: { label: "N2" } })).status,
		).toBe(204);
		let me = (await as(SAM).get("/v1/me")).body;
		expect(me.area.label).toBe("N2");
		expect(Math.abs(me.area.lat - 51.587)).toBeLessThan(0.005);

		answer([[/^\/places\?q=Nowhere/, { result: [] }]]);
		expect(
			(
				await as(SAM).patch("/v1/me", {
					area: { label: "Nowhere in particular" },
				})
			).status,
		).toBe(204);
		me = (await as(SAM).get("/v1/me")).body;
		const centre = await env.DB.prepare(
			"SELECT centre_lat FROM communities WHERE id = ?",
		)
			.bind(me.communityId)
			.first<{ centre_lat: number }>();
		expect(Math.abs(me.area.lat - centre!.centre_lat)).toBeLessThan(0.005);
	});
});

describe("postcodes.io being down", () => {
	it("never shows a full postcode as a member's area", async () => {
		expect(
			(
				await as(SAM).patch("/v1/me", {
					area: { label: "N3 3SS", lat: 51.6, lng: -0.19 },
				})
			).status,
		).toBe(204);
		const row = await env.DB.prepare(
			"SELECT area_label FROM members WHERE id = ?",
		)
			.bind(SAM)
			.first<{ area_label: string }>();
		expect(row?.area_label).toBe("N3");
	});

	it("leaves a name-only area at the library's centre, not refused", async () => {
		const real = globalThis.fetch;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = String(input instanceof Request ? input.url : input);
			return url.startsWith(API)
				? new Response("down", { status: 503 })
				: real(input, init);
		});
		expect(
			(await as(SAM).patch("/v1/me", { area: { label: "Hampstead" } })).status,
		).toBe(204);
	});
});
