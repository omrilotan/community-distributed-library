import { encode } from "uqr";
import { MARK } from "./icon.ts";

/**
 * A join sign for an event: one A4 sheet, folded into a tent that stands on a
 * table. Top to bottom: an end flap, the back face (drawn upside down, so it
 * stands upright once folded), the front face, and the other end flap. The
 * two flaps meet under the tent and are glued one on the other as its base. Each face
 * carries the library's mark, name and line, a large code to scan and when
 * the link works.
 *
 * Drawn on a canvas in the browser, at print resolution, so the site's own
 * font (Heebo) sets the words in either language. Downloads as PNG, or as a
 * one-page A4 PDF holding the same picture.
 */

/** A4 at 300 dots an inch. */
export const SHEET = { width: 2480, height: 3508 } as const;
/** A4 in PDF points. */
export const A4_POINTS = { width: 595.28, height: 841.89 } as const;

/**
 * The parts of the sheet, top to bottom, in dots: an end flap, the two
 * faces (108 mm each), and the other end flap (40 mm each). Folded, the two
 * flaps lie one on the other under the tent and are glued together: the
 * base, twice as thick, which gives it weight.
 */
const FACE = 1281;
const FLAP = (SHEET.height - 2 * FACE) / 2;
export const FOLDS = { face: FACE, flap: FLAP } as const;
const PAD = 130;
/** The code's largest side, leaving the words room for a long name. */
const QR_MAX = 940;
const FONT = '"Heebo Variable", Heebo, system-ui, sans-serif';
const INK = "#1d2a26";
const MUTED = "#5b6763";
const RULE = "#9aa5a1";

export interface SignWords {
	/** The library's name and line, in the sign's language. */
	name: string;
	tagline: string | null;
	scan: string;
	/** "Today only · Thursday 20 Nov", or "Join by Monday 24 Nov". */
	when: string;
	foldHint: string;
	/** The project's name, at the foot of the base. */
	madeWith: string;
	/** What goes on the flap: "Glue". */
	glue: string;
}

export interface SignSpec {
	url: string;
	words: SignWords;
	/** The library's colour for its name and the frame round the code. */
	colour: string;
	rtl: boolean;
}

/** The line saying when the link works: one day's, or until a day. */
export function whenLine(
	window: { startsAt: number | null; expiresAt: number },
	words: {
		todayOnly: (day: string) => string;
		joinBy: (day: string) => string;
		day: (seconds: number) => string;
	},
): string {
	const { startsAt, expiresAt } = window;
	if (startsAt !== null && expiresAt - startsAt <= 25 * 3600)
		return words.todayOnly(words.day(startsAt));
	// The last moment it works, so midnight's link reads as the day before.
	return words.joinBy(words.day(expiresAt - 1));
}

/** Words broken into lines no wider than `width`, at most `max` of them. */
export function wrap(
	measure: (text: string) => number,
	text: string,
	width: number,
	max: number,
): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const next = line ? `${line} ${word}` : word;
		if (measure(next) <= width || !line) line = next;
		else {
			lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	if (lines.length <= max) return lines;
	const kept = lines.slice(0, max);
	kept[max - 1] = `${kept[max - 1]}…`;
	return kept;
}

/** The code's dark squares, drawn crisp at any size. */
export function drawQr(
	ctx: CanvasRenderingContext2D,
	url: string,
	x: number,
	y: number,
	size: number,
	colour = INK,
): void {
	const { data } = encode(url, { border: 0 });
	const cell = size / data.length;
	ctx.fillStyle = colour;
	data.forEach((row, r) =>
		row.forEach((dark, c) => {
			// A hair over a cell each, so neighbours meet without seams.
			if (dark)
				ctx.fillRect(x + c * cell, y + r * cell, cell + 0.6, cell + 0.6);
		}),
	);
}

function drawMark(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	size: number,
	colour: string,
): void {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(size / 1024, size / 1024);
	ctx.fillStyle = colour;
	ctx.fill(new Path2D(MARK));
	ctx.restore();
}

/** One face: the code on one side, the words on the other. */
function drawFace(ctx: CanvasRenderingContext2D, spec: SignSpec): void {
	const { width } = SHEET;
	const { words, colour, rtl } = spec;
	const qr = Math.min(FACE - 2 * PAD, QR_MAX);
	const frame = 28;
	// The code sits at the start of the line: left in English, right in Hebrew.
	const qrX = rtl ? width - PAD - qr : PAD;
	const qrY = (FACE - qr) / 2;
	ctx.fillStyle = colour;
	ctx.fillRect(qrX - frame, qrY - frame, qr + 2 * frame, qr + 2 * frame);
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(
		qrX - frame / 3,
		qrY - frame / 3,
		qr + (2 * frame) / 3,
		qr + (2 * frame) / 3,
	);
	drawQr(ctx, spec.url, qrX + 24, qrY + 24, qr - 48);

	const textWidth = width - qr - 3 * PAD - frame;
	const edge = rtl ? width - PAD - qr - PAD - frame : PAD + qr + PAD + frame;
	ctx.direction = rtl ? "rtl" : "ltr";
	ctx.textAlign = "start";
	ctx.textBaseline = "alphabetic";
	let y = qrY + 40;

	const mark = 190;
	drawMark(ctx, rtl ? edge - mark : edge, y - 30, mark, colour);
	y += mark + 60;

	// The name on one line if it fits a little smaller, else on two.
	ctx.fillStyle = colour;
	let size = 118;
	ctx.font = `800 ${size}px ${FONT}`;
	while (size > 92 && ctx.measureText(words.name).width > textWidth) {
		size -= 4;
		ctx.font = `800 ${size}px ${FONT}`;
	}
	for (const line of wrap(
		(t) => ctx.measureText(t).width,
		words.name,
		textWidth,
		2,
	)) {
		ctx.fillText(line, edge, y);
		y += size + 14;
	}

	if (words.tagline) {
		ctx.fillStyle = MUTED;
		ctx.font = `400 58px ${FONT}`;
		y += 4;
		for (const line of wrap(
			(t) => ctx.measureText(t).width,
			words.tagline,
			textWidth,
			2,
		)) {
			ctx.fillText(line, edge, y);
			y += 74;
		}
	}

	ctx.fillStyle = INK;
	ctx.font = `800 104px ${FONT}`;
	// "Scan to join" and when, level with the foot of the code.
	const scanY = Math.max(y + 60, qrY + qr - 100);
	ctx.fillText(words.scan, edge, scanY);
	ctx.fillStyle = colour;
	ctx.font = `600 62px ${FONT}`;
	ctx.fillText(words.when, edge, scanY + 92);
}

function dashedLine(ctx: CanvasRenderingContext2D, y: number): void {
	ctx.save();
	ctx.strokeStyle = RULE;
	ctx.lineWidth = 5;
	ctx.setLineDash([36, 28]);
	ctx.beginPath();
	ctx.moveTo(0, y);
	ctx.lineTo(SHEET.width, y);
	ctx.stroke();
	ctx.restore();
}

/** The whole sheet, on a canvas SHEET.width by SHEET.height. */
export function drawSign(ctx: CanvasRenderingContext2D, spec: SignSpec): void {
	const { width, height } = SHEET;
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, width, height);

	// The top flap: half the base. It ends up underneath, facing the table,
	// so its words are for whoever folds it.
	ctx.save();
	ctx.direction = spec.rtl ? "rtl" : "ltr";
	ctx.textAlign = "center";
	ctx.fillStyle = MUTED;
	ctx.font = `400 50px ${FONT}`;
	const hint = wrap(
		(t) => ctx.measureText(t).width,
		spec.words.foldHint,
		width - 2 * PAD,
		3,
	);
	hint.forEach((line, i) => ctx.fillText(line, width / 2, 150 + i * 66));
	const mark = 80;
	ctx.font = `600 48px ${FONT}`;
	ctx.fillStyle = INK;
	const label = spec.words.madeWith;
	const labelWidth = ctx.measureText(label).width;
	const footY = FLAP - 90;
	const left = width / 2 - (labelWidth + mark + 26) / 2;
	drawMark(ctx, left, footY - mark + 14, mark, spec.colour);
	ctx.textAlign = "left";
	ctx.direction = "ltr";
	ctx.fillText(label, left + mark + 26, footY);
	ctx.restore();

	// The back face, upside down so it stands upright when folded.
	ctx.save();
	ctx.translate(width, FLAP + FACE);
	ctx.rotate(Math.PI);
	drawFace(ctx, spec);
	ctx.restore();

	// The front face.
	ctx.save();
	ctx.translate(0, FLAP + FACE);
	drawFace(ctx, spec);
	ctx.restore();

	// The bottom flap: the other half of the base, tinted where the glue goes.
	const flapY = FLAP + 2 * FACE;
	ctx.save();
	ctx.fillStyle = "#eef2f0";
	ctx.fillRect(0, flapY, width, FLAP);
	ctx.direction = spec.rtl ? "rtl" : "ltr";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillStyle = MUTED;
	ctx.font = `600 56px ${FONT}`;
	ctx.fillText(spec.words.glue, width / 2, flapY + FLAP / 2);
	ctx.restore();

	dashedLine(ctx, FLAP);
	dashedLine(ctx, FLAP + FACE);
	dashedLine(ctx, flapY);
}

/**
 * A one-page A4 PDF holding a JPEG, filling the page. Written by hand: a
 * catalogue, one page, the picture and the line that draws it, and the
 * table of where each sits in the file.
 */
export function pdfWithImage(
	jpeg: Uint8Array,
	pixels: { width: number; height: number },
	page: { width: number; height: number } = A4_POINTS,
): Uint8Array<ArrayBuffer> {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	const offsets: number[] = [];
	let length = 0;
	const add = (chunk: string | Uint8Array) => {
		const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk;
		parts.push(bytes);
		length += bytes.length;
	};
	const object = (n: number, body: string | Uint8Array[]) => {
		offsets[n] = length;
		add(`${n} 0 obj\n`);
		if (typeof body === "string") add(body);
		else body.forEach(add);
		add("\nendobj\n");
	};
	const draw = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`;

	add("%PDF-1.4\n%âãÏÓ\n");
	object(1, "<< /Type /Catalog /Pages 2 0 R >>");
	object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
	object(
		3,
		`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
	);
	object(4, [
		encoder.encode(
			`<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
		),
		jpeg,
		encoder.encode("\nendstream"),
	]);
	object(5, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);

	const xref = length;
	add(`xref\n0 6\n0000000000 65535 f \n`);
	for (let n = 1; n <= 5; n++)
		add(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
	add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

	const out = new Uint8Array(length);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}
