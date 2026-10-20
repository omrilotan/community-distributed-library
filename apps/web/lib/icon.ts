/**
 * The library's icons, drawn here in its own colour: the mark from
 * packages/design/logo.svg, as an SVG, a PNG of any size, or a favicon.ico.
 * There is no image library in a Worker, so the mark is filled by hand: the
 * path is cut into straight edges and each pixel is given the share of it the
 * shape covers, which is what an anti-aliased renderer does.
 */

/** The mark, as in packages/design/logo.svg, in a 1024 box. */
const MARK =
	"M289.6 102.4c135.3 135.2 182.8 323.8 140.6 490.9 167.1-42.2 355.7 5.4 490.9 140.6L820.9 834.1C676.5 689.7 450.1 681.4 314 815.5L208 709.6c134.1-136.2 125.8-362.5-18.6-507Z";

/** The app icon's ground, as in public/icon.svg before it was drawn here. */
const GROUND = "#fcfdfc";

/**
 * The app icon: the mark at 72%, centred on its ground, with room around it
 * for a phone to cut a circle or a squircle out of it.
 */
const APP = { box: 1024, scale: 0.72, centre: [555.25, 468.25] } as const;

/** The favicon: the mark alone, filling its box, on nothing. */
const FAVICON = { left: 169, top: 82, box: 772 } as const;

export function appIconSvg(fill: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${APP.box} ${APP.box}" role="img" aria-label="Community Distributed Library"><rect width="${APP.box}" height="${APP.box}" fill="${GROUND}"/><path fill="${fill}" transform="translate(${APP.box / 2} ${APP.box / 2}) scale(${APP.scale}) translate(${-APP.centre[0]} ${-APP.centre[1]})" d="${MARK}"/></svg>`;
}

/** The tab's icon, in the colour that reads on a light tab and on a dark one. */
export function faviconSvg(light: string, dark: string): string {
	const style =
		light === dark
			? ""
			: `<style>path{fill:${light}}@media (prefers-color-scheme:dark){path{fill:${dark}}}</style>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${FAVICON.left} ${FAVICON.top} ${FAVICON.box} ${FAVICON.box}" role="img" aria-label="Community Distributed Library">${style}<path fill="${light}" d="${MARK}"/></svg>`;
}

/** The app icon as a square PNG, for a home screen or a notification. */
export function appIconPng(
	size: number,
	fill: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const k = size / APP.box;
	const cover = coverage(size, (x, y) => [
		k * (APP.box / 2 + APP.scale * (x - APP.centre[0])),
		k * (APP.box / 2 + APP.scale * (y - APP.centre[1])),
	]);
	const ground = rgb(GROUND);
	const ink = rgb(fill);
	const pixels = new Uint8Array(size * size * 3);
	for (let i = 0; i < cover.length; i++)
		for (let c = 0; c < 3; c++)
			pixels[i * 3 + c] = Math.round(
				ground[c]! + (ink[c]! - ground[c]!) * cover[i]!,
			);
	return png(size, 3, pixels);
}

/** favicon.ico: the mark alone at 16, 32 and 48 pixels, on nothing. */
export async function faviconIco(
	fill: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const sizes = [16, 32, 48];
	const ink = rgb(fill);
	const images = await Promise.all(
		sizes.map((size) => {
			const k = size / FAVICON.box;
			const cover = coverage(size, (x, y) => [
				k * (x - FAVICON.left),
				k * (y - FAVICON.top),
			]);
			const pixels = new Uint8Array(size * size * 4);
			for (let i = 0; i < cover.length; i++) {
				pixels.set(ink, i * 4);
				pixels[i * 4 + 3] = Math.round(255 * cover[i]!);
			}
			return png(size, 4, pixels);
		}),
	);
	// An icon directory, then one entry per image, then the images: PNGs, which
	// every browser since Vista-era Internet Explorer reads inside an .ico.
	const head = 6 + 16 * images.length;
	const out = new Uint8Array(
		head + images.reduce((sum, image) => sum + image.length, 0),
	);
	const view = new DataView(out.buffer);
	view.setUint16(2, 1, true);
	view.setUint16(4, images.length, true);
	let offset = head;
	images.forEach((image, i) => {
		const entry = 6 + 16 * i;
		out[entry] = sizes[i]!;
		out[entry + 1] = sizes[i]!;
		view.setUint16(entry + 4, 1, true);
		view.setUint16(entry + 6, 32, true);
		view.setUint32(entry + 8, image.length, true);
		view.setUint32(entry + 12, offset, true);
		out.set(image, offset);
		offset += image.length;
	});
	return out;
}

type Point = [number, number];

/**
 * How much of each pixel of a size × size square the mark covers, 0 to 1.
 * Sixteen lines through every row of pixels; along each line the covered
 * stretches are added to the pixels exactly, so edges come out smooth.
 */
function coverage(size: number, place: (x: number, y: number) => Point) {
	const edges = flatten(MARK).map(
		([a, b]) => [place(...a), place(...b)] as [Point, Point],
	);
	const cover = new Float32Array(size * size);
	const LINES = 16;
	const crossings: { x: number; winding: number }[] = [];
	for (let row = 0; row < size; row++)
		for (let line = 0; line < LINES; line++) {
			const y = row + (line + 0.5) / LINES;
			crossings.length = 0;
			for (const [[x0, y0], [x1, y1]] of edges) {
				if (y0 === y1 || y < Math.min(y0, y1) || y >= Math.max(y0, y1))
					continue;
				crossings.push({
					x: x0 + ((y - y0) * (x1 - x0)) / (y1 - y0),
					winding: y1 > y0 ? 1 : -1,
				});
			}
			crossings.sort((a, b) => a.x - b.x);
			// Inside wherever the winding is not zero.
			let winding = 0;
			let from = 0;
			for (const crossing of crossings) {
				const was = winding;
				winding += crossing.winding;
				if (was === 0 && winding !== 0) from = crossing.x;
				else if (was !== 0 && winding === 0)
					fill(cover, row * size, size, from, crossing.x, 1 / LINES);
			}
		}
	return cover;
}

/** Add a covered stretch [from, to) of one line to the pixels it crosses. */
function fill(
	cover: Float32Array,
	start: number,
	size: number,
	from: number,
	to: number,
	weight: number,
) {
	const a = Math.max(0, from);
	const b = Math.min(size, to);
	for (let x = Math.floor(a); x < b; x++)
		cover[start + x]! += (Math.min(b, x + 1) - Math.max(a, x)) * weight;
}

/**
 * The path as straight edges: moves, lines and cubic curves, absolute or
 * relative, which is all the mark uses. A curve becomes 64 short lines.
 */
function flatten(d: string): [Point, Point][] {
	const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
	const edges: [Point, Point][] = [];
	let at: Point = [0, 0];
	let start: Point = [0, 0];
	let command = "";
	let i = 0;
	const number = () => Number(tokens[i++]);
	const line = (to: Point) => {
		edges.push([at, to]);
		at = to;
	};
	while (i < tokens.length) {
		if (/[a-zA-Z]/.test(tokens[i]!)) command = tokens[i++]!;
		const relative = command === command.toLowerCase();
		const base: Point = relative ? at : [0, 0];
		const point = (): Point => [base[0] + number(), base[1] + number()];
		switch (command.toUpperCase()) {
			case "M":
				at = start = point();
				// Further pairs after a move are lines.
				command = relative ? "l" : "L";
				break;
			case "L":
				line(point());
				break;
			case "C": {
				const from = at;
				const [c1, c2, to] = [point(), point(), point()];
				for (let step = 1; step <= 64; step++) {
					const t = step / 64;
					const u = 1 - t;
					line([
						u * u * u * from[0] +
							3 * u * u * t * c1[0] +
							3 * u * t * t * c2[0] +
							t * t * t * to[0],
						u * u * u * from[1] +
							3 * u * u * t * c1[1] +
							3 * u * t * t * c2[1] +
							t * t * t * to[1],
					]);
				}
				break;
			}
			case "Z":
				line(start);
				break;
			default:
				throw new Error(
					`The mark uses a path command not drawn here: ${command}`,
				);
		}
	}
	return edges;
}

function rgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A PNG of 8-bit RGB (3 channels) or RGBA (4), every row unfiltered. */
async function png(
	size: number,
	channels: 3 | 4,
	pixels: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
	const stride = size * channels;
	const raw = new Uint8Array((stride + 1) * size);
	for (let row = 0; row < size; row++)
		raw.set(
			pixels.subarray(row * stride, (row + 1) * stride),
			row * (stride + 1) + 1,
		);
	// "deflate" is the zlib format, which is what a PNG's image data is.
	const compressed = new Uint8Array(
		await new Response(
			new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate")),
		).arrayBuffer(),
	);
	const header = new Uint8Array(13);
	const view = new DataView(header.buffer);
	view.setUint32(0, size);
	view.setUint32(4, size);
	header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8);
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", compressed),
		chunk("IEND", new Uint8Array()),
	];
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
