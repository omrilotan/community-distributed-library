/**
 * Just enough of a TrueType reader to draw a line of text: a WOFF's tables,
 * the character map, the advances and the glyph outlines. No kerning, no
 * shaping — Hebrew and Latin need neither to be legible on a link's card.
 */

export type Point = [number, number];
export type Edge = [Point, Point];

export interface Font {
	/** Font units to the em. */
	unitsPerEm: number;
	/** The glyph for a character, 0 when the font has none. */
	glyph(code: number): number;
	/** How far the pen moves after a glyph, in font units. */
	advance(glyph: number): number;
	/** The glyph's outline as straight edges, in font units, y up. */
	outline(glyph: number): Edge[];
}

/** Read a WOFF (1.0) file: each table stored whole or zlib-compressed. */
export async function readWoff(bytes: Uint8Array): Promise<Font> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0) !== 0x774f4646) throw new Error("Not a WOFF file");
	const count = view.getUint16(12);
	const tables = new Map<string, DataView>();
	for (let i = 0; i < count; i++) {
		const entry = 44 + i * 20;
		const tag = String.fromCharCode(...bytes.subarray(entry, entry + 4));
		const offset = view.getUint32(entry + 4);
		const stored = view.getUint32(entry + 8);
		const length = view.getUint32(entry + 12);
		let data = bytes.subarray(offset, offset + stored);
		if (stored < length) data = await inflate(data);
		tables.set(
			tag,
			new DataView(data.buffer, data.byteOffset, data.byteLength),
		);
	}
	return readTables(tables);
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
	return new Uint8Array(
		await new Response(
			new Blob([data as Uint8Array<ArrayBuffer>])
				.stream()
				.pipeThrough(new DecompressionStream("deflate")),
		).arrayBuffer(),
	);
}

function readTables(tables: Map<string, DataView>): Font {
	const table = (tag: string) => {
		const found = tables.get(tag);
		if (!found) throw new Error(`The font has no ${tag} table`);
		return found;
	};
	const head = table("head");
	const unitsPerEm = head.getUint16(18);
	const longOffsets = head.getInt16(50) === 1;
	const glyphs = table("maxp").getUint16(4);
	const metrics = table("hhea").getUint16(34);
	const hmtx = table("hmtx");
	const loca = table("loca");
	const glyf = table("glyf");
	const characters = characterMap(table("cmap"));

	const start = (glyph: number) =>
		longOffsets ? loca.getUint32(glyph * 4) : loca.getUint16(glyph * 2) * 2;
	const outlines = new Map<number, Edge[]>();

	const outline = (glyph: number): Edge[] => {
		const known = outlines.get(glyph);
		if (known) return known;
		const edges: Edge[] = [];
		if (glyph < glyphs) {
			const from = start(glyph);
			if (start(glyph + 1) > from) {
				const contours = glyf.getInt16(from);
				if (contours >= 0) simple(glyf, from, contours, edges);
				else composite(glyf, from, outline, edges);
			}
		}
		outlines.set(glyph, edges);
		return edges;
	};

	return {
		unitsPerEm,
		glyph: (code) => characters.get(code) ?? 0,
		advance: (glyph) => hmtx.getUint16(4 * Math.min(glyph, metrics - 1)),
		outline,
	};
}

/** Unicode to glyph, from a format 4 (BMP) or format 12 (full) subtable. */
function characterMap(cmap: DataView): Map<number, number> {
	const map = new Map<number, number>();
	const count = cmap.getUint16(2);
	let best = -1;
	let bestFormat = 0;
	for (let i = 0; i < count; i++) {
		const platform = cmap.getUint16(4 + i * 8);
		const encoding = cmap.getUint16(6 + i * 8);
		const offset = cmap.getUint32(8 + i * 8);
		const format = cmap.getUint16(offset);
		const unicode =
			platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
		if (unicode && (format === 12 || (format === 4 && bestFormat !== 12))) {
			best = offset;
			bestFormat = format;
		}
	}
	if (best < 0) throw new Error("The font has no Unicode character map");
	if (bestFormat === 12) {
		const groups = cmap.getUint32(best + 12);
		for (let i = 0; i < groups; i++) {
			const at = best + 16 + i * 12;
			const first = cmap.getUint32(at);
			const last = cmap.getUint32(at + 4);
			const glyph = cmap.getUint32(at + 8);
			for (let code = first; code <= last; code++)
				map.set(code, glyph + code - first);
		}
		return map;
	}
	const segments = cmap.getUint16(best + 6) / 2;
	const ends = best + 14;
	const starts = ends + segments * 2 + 2;
	const deltas = starts + segments * 2;
	const ranges = deltas + segments * 2;
	for (let i = 0; i < segments; i++) {
		const end = cmap.getUint16(ends + i * 2);
		const first = cmap.getUint16(starts + i * 2);
		const delta = cmap.getInt16(deltas + i * 2);
		const range = cmap.getUint16(ranges + i * 2);
		for (let code = first; code <= end && code !== 0xffff; code++) {
			let glyph: number;
			if (range === 0) glyph = (code + delta) & 0xffff;
			else {
				const at = ranges + i * 2 + range + (code - first) * 2;
				glyph = cmap.getUint16(at);
				if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
			}
			if (glyph !== 0) map.set(code, glyph);
		}
	}
	return map;
}

/** A glyph of its own contours: on- and off-curve points, quadratic curves. */
function simple(glyf: DataView, from: number, contours: number, edges: Edge[]) {
	let at = from + 10;
	const ends: number[] = [];
	for (let i = 0; i < contours; i++, at += 2) ends.push(glyf.getUint16(at));
	const points = contours ? ends[contours - 1]! + 1 : 0;
	at += 2 + glyf.getUint16(at);
	const flags: number[] = [];
	while (flags.length < points) {
		const flag = glyf.getUint8(at++);
		flags.push(flag);
		if (flag & 8) {
			const repeat = glyf.getUint8(at++);
			for (let r = 0; r < repeat; r++) flags.push(flag);
		}
	}
	const coordinates = (short: number, same: number) => {
		const values: number[] = [];
		let value = 0;
		for (const flag of flags) {
			if (flag & short) {
				const step = glyf.getUint8(at++);
				value += flag & same ? step : -step;
			} else if (!(flag & same)) {
				value += glyf.getInt16(at);
				at += 2;
			}
			values.push(value);
		}
		return values;
	};
	const xs = coordinates(2, 16);
	const ys = coordinates(4, 32);
	let first = 0;
	for (const end of ends) {
		const contour: { point: Point; on: boolean }[] = [];
		for (let i = first; i <= end; i++)
			contour.push({ point: [xs[i]!, ys[i]!], on: (flags[i]! & 1) === 1 });
		trace(contour, edges);
		first = end + 1;
	}
}

/** One closed contour as lines; each quadratic curve becomes 8 of them. */
function trace(contour: { point: Point; on: boolean }[], edges: Edge[]) {
	if (contour.length < 2) return;
	const mid = (a: Point, b: Point): Point => [
		(a[0] + b[0]) / 2,
		(a[1] + b[1]) / 2,
	];
	// Start on the curve: the first on-curve point, or between two off ones.
	const onAt = contour.findIndex((one) => one.on);
	const ring =
		onAt < 0 ? contour : [...contour.slice(onAt), ...contour.slice(0, onAt)];
	const startPoint =
		onAt < 0
			? mid(contour[contour.length - 1]!.point, contour[0]!.point)
			: ring[0]!.point;
	let pen = startPoint;
	let control: Point | null = null;
	const line = (to: Point) => {
		edges.push([pen, to]);
		pen = to;
	};
	const curve = (c: Point, to: Point) => {
		const from = pen;
		for (let step = 1; step <= 8; step++) {
			const t = step / 8;
			const u = 1 - t;
			line([
				u * u * from[0] + 2 * u * t * c[0] + t * t * to[0],
				u * u * from[1] + 2 * u * t * c[1] + t * t * to[1],
			]);
		}
	};
	for (let i = onAt < 0 ? 0 : 1; i <= ring.length; i++) {
		const one = i === ring.length ? { point: startPoint, on: true } : ring[i]!;
		if (one.on) {
			if (control) curve(control, one.point);
			else line(one.point);
			control = null;
		} else if (control) {
			const between = mid(control, one.point);
			curve(control, between);
			control = one.point;
		} else control = one.point;
	}
}

/** A glyph made of others, each moved (and perhaps scaled) into place. */
function composite(
	glyf: DataView,
	from: number,
	outline: (glyph: number) => Edge[],
	edges: Edge[],
) {
	let at = from + 10;
	let more = true;
	while (more) {
		const flags = glyf.getUint16(at);
		const glyph = glyf.getUint16(at + 2);
		at += 4;
		let dx = 0;
		let dy = 0;
		if (flags & 1) {
			dx = flags & 2 ? glyf.getInt16(at) : 0;
			dy = flags & 2 ? glyf.getInt16(at + 2) : 0;
			at += 4;
		} else {
			dx = flags & 2 ? glyf.getInt8(at) : 0;
			dy = flags & 2 ? glyf.getInt8(at + 1) : 0;
			at += 2;
		}
		let [a, b, c, d] = [1, 0, 0, 1];
		const f2dot14 = (offset: number) => glyf.getInt16(offset) / 16384;
		if (flags & 8) {
			a = d = f2dot14(at);
			at += 2;
		} else if (flags & 0x40) {
			a = f2dot14(at);
			d = f2dot14(at + 2);
			at += 4;
		} else if (flags & 0x80) {
			a = f2dot14(at);
			b = f2dot14(at + 2);
			c = f2dot14(at + 4);
			d = f2dot14(at + 6);
			at += 8;
		}
		const place = ([x, y]: Point): Point => [
			a * x + c * y + dx,
			b * x + d * y + dy,
		];
		for (const [p, q] of outline(glyph)) edges.push([place(p), place(q)]);
		more = (flags & 0x20) !== 0;
	}
}
