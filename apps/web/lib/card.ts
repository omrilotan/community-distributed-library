import hebrewBold from "@fontsource/heebo/files/heebo-hebrew-700-normal.woff?inline";
import hebrewRegular from "@fontsource/heebo/files/heebo-hebrew-400-normal.woff?inline";
import latinBold from "@fontsource/heebo/files/heebo-latin-700-normal.woff?inline";
import latinRegular from "@fontsource/heebo/files/heebo-latin-400-normal.woff?inline";
import { readWoff, type Edge, type Font, type Point } from "./font.ts";
import { MARK, flatten, png, raster, rgb } from "./icon.ts";

/**
 * The card a shared link shows (WhatsApp, Telegram, Slack, iMessage): the
 * library's colour, its mark, its name, its line and its address, 1200 by
 * 630 — the size every one of them shows large. Drawn like the icons, by
 * hand, in Heebo: the letters the site itself is set in.
 */
export const CARD = { width: 1200, height: 630 } as const;

const PAD = 80;
const MARK_SIZE = 300;
const GAP = 56;
const WHITE = "#ffffff";

export interface Face {
	hebrew: Font;
	latin: Font;
}

let faces: Promise<{ bold: Face; regular: Face }> | null = null;

/** The fonts, read once an isolate. */
function fonts() {
	faces ??= (async () => {
		const [hb, hr, lb, lr] = await Promise.all(
			[hebrewBold, hebrewRegular, latinBold, latinRegular].map((url) =>
				readWoff(fromDataUrl(url)),
			),
		);
		return {
			bold: { hebrew: hb!, latin: lb! },
			regular: { hebrew: hr!, latin: lr! },
		};
	})();
	return faces;
}

function fromDataUrl(url: string): Uint8Array {
	const binary = atob(url.slice(url.indexOf(",") + 1));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export async function cardPng({
	name,
	tagline,
	host,
	colour,
}: {
	name: string;
	tagline: string | null;
	host: string;
	colour: string;
}): Promise<Uint8Array<ArrayBuffer>> {
	const { bold, regular } = await fonts();
	const { width, height } = CARD;
	const rtl = direction(name) === "rtl";
	const textWidth = width - 2 * PAD - MARK_SIZE - GAP;
	// The text on the side its language reads from, the mark on the other.
	const textStart = rtl ? width - PAD : PAD;
	const markLeft = rtl ? PAD : width - PAD - MARK_SIZE;

	// The name as large as fits in two lines, the line under it in three.
	let size = 88;
	let nameLines = wrap(name, bold, size, textWidth, 2);
	while (size > 52 && nameLines.cut) {
		size -= 4;
		nameLines = wrap(name, bold, size, textWidth, 2);
	}
	const taglineSize = 36;
	const taglineLines = tagline
		? wrap(tagline, regular, taglineSize, textWidth, 3)
		: { lines: [], cut: false };
	const nameLeading = size * 1.15;
	const taglineLeading = taglineSize * 1.4;
	const block =
		nameLines.lines.length * nameLeading +
		(taglineLines.lines.length
			? 28 + taglineLines.lines.length * taglineLeading
			: 0);
	const hostSize = 28;
	const hostBaseline = height - PAD + 8;
	// Centred in the room above the address.
	let top = Math.max(PAD - 8, (hostBaseline - hostSize - 24 - block) / 2 + 12);

	const bright: Edge[] = [];
	const soft: Edge[] = [];
	for (const line of nameLines.lines) {
		top += nameLeading;
		setLine(bright, line, bold, size, textStart, top - size * 0.22, rtl);
	}
	if (taglineLines.lines.length) top += 28;
	for (const line of taglineLines.lines) {
		top += taglineLeading;
		setLine(
			soft,
			line,
			regular,
			taglineSize,
			textStart,
			top - taglineSize * 0.3,
			rtl,
		);
	}
	setLine(soft, host, regular, hostSize, textStart, hostBaseline, rtl);

	// The mark, as in the app icon, filling its square.
	const k = MARK_SIZE / 772;
	const markTop = (height - MARK_SIZE) / 2 - 20;
	for (const [a, b] of flatten(MARK))
		bright.push([
			[markLeft + k * (a[0] - 169), markTop + k * (a[1] - 82)],
			[markLeft + k * (b[0] - 169), markTop + k * (b[1] - 82)],
		]);

	const ground = rgb(colour);
	const ink = rgb(WHITE);
	const full = raster(width, height, bright);
	const faint = raster(width, height, soft);
	const pixels = new Uint8Array(width * height * 3);
	for (let i = 0; i < full.length; i++) {
		const amount = Math.min(1, full[i]! + faint[i]! * 0.82);
		for (let c = 0; c < 3; c++)
			pixels[i * 3 + c] = Math.round(
				ground[c]! + (ink[c]! - ground[c]!) * amount,
			);
	}
	return png(width, 3, pixels, height);
}

const HEBREW = /[֐-׿יִ-ﭏ]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

function direction(text: string): "rtl" | "ltr" {
	for (const ch of text) {
		if (HEBREW.test(ch)) return "rtl";
		if (LATIN.test(ch)) return "ltr";
	}
	return "ltr";
}

/** A character's glyph: Hebrew from the Hebrew file, anything else Latin first. */
function pick(face: Face, ch: string): { font: Font; glyph: number } {
	const code = ch.codePointAt(0)!;
	const order = HEBREW.test(ch)
		? [face.hebrew, face.latin]
		: [face.latin, face.hebrew];
	for (const font of order) {
		const glyph = font.glyph(code);
		if (glyph) return { font, glyph };
	}
	return { font: face.latin, glyph: face.latin.glyph(32) };
}

function measure(text: string, face: Face, size: number): number {
	let width = 0;
	for (const ch of text) {
		const { font, glyph } = pick(face, ch);
		width += (font.advance(glyph) * size) / font.unitsPerEm;
	}
	return width;
}

/** Characters as a reader sees them: a letter keeps its marks (niqqud). */
const letters = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function graphemes(text: string): string[] {
	return Array.from(letters.segment(text), (part) => part.segment);
}

/**
 * Words into at most `max` lines; the last cut short with an ellipsis. A word
 * wider than the column on its own (a long compound, an address) is broken
 * between letters rather than drawn across the mark beside it.
 */
export function wrap(
	text: string,
	face: Face,
	size: number,
	width: number,
	max: number,
): { lines: string[]; cut: boolean } {
	const lines: string[] = [];
	let line = "";
	for (const word of text.trim().split(/\s+/)) {
		const next = line ? `${line} ${word}` : word;
		if (measure(next, face, size) <= width) {
			line = next;
			continue;
		}
		if (line) lines.push(line);
		line = "";
		for (const letter of graphemes(word)) {
			if (line && measure(line + letter, face, size) > width) {
				lines.push(line);
				line = letter;
			} else line += letter;
		}
	}
	if (line) lines.push(line);
	const cut = lines.length > max;
	if (!cut) return { lines, cut };
	const kept = lines.slice(0, max);
	let last = kept[max - 1]!;
	while (last && measure(`${last}…`, face, size) > width)
		last = graphemes(last).slice(0, -1).join("").trimEnd();
	kept[max - 1] = `${last}…`;
	return { lines: kept, cut };
}

const MIRRORED: Record<string, string> = {
	"(": ")",
	")": "(",
	"[": "]",
	"]": "[",
	"<": ">",
	">": "<",
	"«": "»",
	"»": "«",
};

/**
 * A line in the order it is seen: runs of Hebrew right to left, runs of
 * anything else left to right, and the runs in the line's own direction.
 * Spaces and marks between two runs go with the line's direction.
 */
function visual(text: string): string[] {
	const base = direction(text);
	const chars = [...text];
	const kinds = chars.map((ch) =>
		HEBREW.test(ch) ? "rtl" : LATIN.test(ch) || /\d/.test(ch) ? "ltr" : null,
	);
	// A neutral takes the direction around it when both sides agree.
	const resolved = kinds.map((kind, i) => {
		if (kind) return kind;
		const before = kinds.slice(0, i).reverse().find(Boolean) ?? base;
		const after = kinds.slice(i + 1).find(Boolean) ?? base;
		return before === after ? before : base;
	});
	const runs: { dir: string; chars: string[] }[] = [];
	chars.forEach((ch, i) => {
		const dir = resolved[i]!;
		const last = runs[runs.length - 1];
		if (last && last.dir === dir) last.chars.push(ch);
		else runs.push({ dir, chars: [ch] });
	});
	const ordered = base === "rtl" ? runs.reverse() : runs;
	return ordered.flatMap((run) =>
		run.dir === "rtl"
			? run.chars.reverse().map((ch) => MIRRORED[ch] ?? ch)
			: run.chars,
	);
}

/** Set one line from `x`: to its right, or for right-to-left, to its left. */
function setLine(
	edges: Edge[],
	text: string,
	face: Face,
	size: number,
	x: number,
	baseline: number,
	rtl: boolean,
) {
	const glyphs = visual(text);
	let pen = rtl ? x - measure(text, face, size) : x;
	for (const ch of glyphs) {
		const { font, glyph } = pick(face, ch);
		const k = size / font.unitsPerEm;
		const place = ([gx, gy]: Point): Point => [pen + gx * k, baseline - gy * k];
		for (const [a, b] of font.outline(glyph)) edges.push([place(a), place(b)]);
		pen += font.advance(glyph) * k;
	}
}
