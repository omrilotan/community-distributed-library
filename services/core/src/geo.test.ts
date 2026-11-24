import { describe, expect, it } from "vitest";
import { boundingBox, coarseDistanceM, distanceM } from "./geo.ts";

const churchEnd = { lat: 51.6021, lng: -0.189 };
const northElm = { lat: 51.598, lng: -0.1975 };

describe("distanceM", () => {
	it("is zero for the same point", () => {
		expect(distanceM(churchEnd, churchEnd)).toBe(0);
	});

	it("measures the Elm Green seed members roughly 750 m apart", () => {
		const metres = distanceM(churchEnd, northElm);
		expect(metres).toBeGreaterThan(700);
		expect(metres).toBeLessThan(800);
	});

	it("is symmetric", () => {
		expect(distanceM(churchEnd, northElm)).toBe(distanceM(northElm, churchEnd));
	});
});

describe("boundingBox", () => {
	it("contains points within the radius and excludes points well outside it", () => {
		const box = boundingBox(churchEnd, 1000);
		expect(northElm.lat).toBeGreaterThan(box.latMin);
		expect(northElm.lat).toBeLessThan(box.latMax);
		expect(northElm.lng).toBeGreaterThan(box.lngMin);
		expect(northElm.lng).toBeLessThan(box.lngMax);

		const centralLondon = { lat: 51.5074, lng: -0.1278 };
		expect(centralLondon.lat).toBeLessThan(box.latMin);
	});
});

describe("coarseDistanceM", () => {
	it("never reveals less than 100 m", () => {
		expect(coarseDistanceM(0)).toBe(100);
		expect(coarseDistanceM(40)).toBe(100);
	});

	it("rounds to the nearest 100 m", () => {
		expect(coarseDistanceM(749)).toBe(700);
		expect(coarseDistanceM(750)).toBe(800);
	});
});
