import { describe, expect, it } from "vitest";
import {
	COVER_ASPECT,
	OUTPUT_HEIGHT,
	OUTPUT_WIDTH,
	centred,
	clamp,
	cropRect,
	minZoom,
	nudged,
	zoomed,
} from "./crop.ts";

const frame = { width: 200, height: 200 / COVER_ASPECT }; // 200×320
const wide = { width: 1600, height: 800 };
const tall = { width: 500, height: 800 }; // exactly 5:8

describe("output size", () => {
	it("is the cover aspect", () => {
		expect(OUTPUT_WIDTH / OUTPUT_HEIGHT).toBeCloseTo(COVER_ASPECT, 3);
	});
});

describe("centred", () => {
	it("covers the frame with no gap on a wide image", () => {
		const view = centred(wide, frame);
		const rect = cropRect(view, wide, frame);
		expect(rect.sh).toBeCloseTo(wide.height, 5);
		expect(rect.sx).toBeGreaterThan(0);
		expect(rect.sx + rect.sw).toBeLessThanOrEqual(wide.width + 1e-6);
	});

	it("shows the whole width of a cover-shaped image", () => {
		const rect = cropRect(centred(tall, frame), tall, frame);
		expect(rect.sx).toBeCloseTo(0, 5);
		expect(rect.sw).toBeCloseTo(tall.width, 5);
	});
});

describe("clamp", () => {
	it("never lets the image leave an empty corner", () => {
		const view = clamp({ zoom: 1, offsetX: 500, offsetY: -9999 }, wide, frame);
		const rect = cropRect(view, wide, frame);
		expect(rect.sx).toBeGreaterThanOrEqual(0);
		expect(rect.sy).toBeGreaterThanOrEqual(0);
		expect(rect.sx + rect.sw).toBeLessThanOrEqual(wide.width + 1e-6);
		expect(rect.sy + rect.sh).toBeLessThanOrEqual(wide.height + 1e-6);
	});

	it("limits zoom to the allowed range", () => {
		expect(clamp({ zoom: 0.2, offsetX: 0, offsetY: 0 }, wide, frame).zoom).toBe(
			1,
		);
		expect(clamp({ zoom: 9, offsetX: 0, offsetY: 0 }, wide, frame).zoom).toBe(
			3,
		);
	});
});

describe("zoomed", () => {
	it("keeps the frame centre on the same image point", () => {
		const start = centred(wide, frame);
		const before = cropRect(start, wide, frame);
		const after = cropRect(zoomed(start, 2, wide, frame), wide, frame);
		expect(after.sx + after.sw / 2).toBeCloseTo(before.sx + before.sw / 2, 5);
		expect(after.sy + after.sh / 2).toBeCloseTo(before.sy + before.sh / 2, 5);
		expect(after.sw).toBeCloseTo(before.sw / 2, 5);
	});
});

describe("a square frame that may pad", () => {
	const square = { width: 300, height: 300 };
	const portrait = { width: 600, height: 1200 };

	it("zooms out until the whole photo fits, and no further", () => {
		// Cover-fit is 0.5 (width), contain-fit is 0.25 (height): half the zoom.
		expect(minZoom(portrait, square, true)).toBeCloseTo(0.5, 5);
		expect(minZoom(portrait, square, false)).toBe(1);
		const out = clamp(
			{ zoom: 0.1, offsetX: 0, offsetY: 0 },
			portrait,
			square,
			true,
		);
		expect(out.zoom).toBeCloseTo(0.5, 5);
	});

	it("keeps a padded photo inside the frame", () => {
		// At zoom 0.5 the photo is 150×300: it may slide sideways within the frame.
		const right = clamp(
			{ zoom: 0.5, offsetX: 500, offsetY: 40 },
			portrait,
			square,
			true,
		);
		expect(right.offsetX).toBeCloseTo(150, 5);
		expect(right.offsetY).toBeCloseTo(0, 5);
		const left = clamp(
			{ zoom: 0.5, offsetX: -20, offsetY: 0 },
			portrait,
			square,
			true,
		);
		expect(left.offsetX).toBe(0);
	});

	it("still fills the frame when zoomed in", () => {
		const view = clamp(
			{ zoom: 1, offsetX: 50, offsetY: 50 },
			portrait,
			square,
			true,
		);
		expect(view.offsetX).toBe(0);
		expect(view.offsetY).toBe(0);
	});
});

describe("nudged", () => {
	it("moves the picture by the arrow keys, further with Shift, and stops at its edge", () => {
		const view = zoomed(centred(wide, frame), 2, wide, frame);
		const right = nudged(view, "ArrowRight", false, wide, frame)!;
		expect(right.offsetX - view.offsetX).toBeCloseTo(8, 5);
		const up = nudged(view, "ArrowUp", true, wide, frame)!;
		expect(up.offsetY - view.offsetY).toBeCloseTo(-32, 5);
		expect(nudged(view, "Enter", false, wide, frame)).toBeNull();
		// Held down, it stops where a drag would.
		let far = view;
		for (let press = 0; press < 500; press++)
			far = nudged(far, "ArrowRight", true, wide, frame)!;
		expect(far).toEqual(clamp({ ...view, offsetX: 1e9 }, wide, frame));
	});
});
