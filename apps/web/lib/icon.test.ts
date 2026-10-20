import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { appIconPng, appIconSvg, faviconIco, faviconSvg } from "./icon.ts";

/** The pixels of a PNG this module wrote: one IDAT, every row unfiltered. */
function pixels(png: Uint8Array) {
	const view = new DataView(png.buffer, png.byteOffset);
	expect([...png.subarray(0, 8)]).toEqual([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	const size = view.getUint32(16);
	const channels = png[25] === 6 ? 4 : 3;
	const length = view.getUint32(33);
	const raw = inflateSync(png.subarray(41, 41 + length));
	const at = (x: number, y: number) => {
		const start = y * (size * channels + 1) + 1 + x * channels;
		return [...raw.subarray(start, start + channels)];
	};
	return { size, channels, at };
}

describe("the library's icons", () => {
	it("draws the app icon in the colour asked for, on the house ground", async () => {
		const { size, channels, at } = pixels(await appIconPng(192, "#3366ff"));
		expect(size).toBe(192);
		expect(channels).toBe(3);
		// A corner is ground; the middle of the mark's upright stroke is ink.
		expect(at(2, 2)).toEqual([0xfc, 0xfd, 0xfc]);
		expect(at(64, 96)).toEqual([0x33, 0x66, 0xff]);
	});

	it("makes a favicon.ico of three sizes on nothing", async () => {
		const ico = await faviconIco("#e91e63");
		const view = new DataView(ico.buffer, ico.byteOffset);
		expect(view.getUint16(2, true)).toBe(1);
		expect(view.getUint16(4, true)).toBe(3);
		expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
		const offset = view.getUint32(6 + 16 + 12, true);
		const { size, channels, at } = pixels(ico.subarray(offset));
		expect(size).toBe(32);
		expect(channels).toBe(4);
		expect(at(0, 31)[3]).toBe(0);
	});

	it("writes the SVGs with the colour, and the favicon's dark one", () => {
		expect(appIconSvg("#3366ff")).toContain('fill="#3366ff"');
		expect(faviconSvg("#16a085", "#16a085")).not.toContain("<style>");
		expect(faviconSvg("#0f4bff", "#5c85ff")).toContain(
			"@media (prefers-color-scheme:dark){path{fill:#5c85ff}}",
		);
	});
});
