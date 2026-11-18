import { renderSVG } from "uqr";
import {
	drawQr,
	drawSign,
	pdfWithImage,
	SHEET,
	type SignSpec,
} from "./sign.ts";

/**
 * Files made in the browser from a link shown once: its code as a picture,
 * and the event sign. Nothing here reaches the server; the link never
 * leaves the page it was shown on.
 */

/** Hand the visitor a file, as a download. */
export function save(blob: Blob, filename: string): void {
	const href = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = href;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function blobOf(
	canvas: HTMLCanvasElement,
	type: "image/png" | "image/jpeg",
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("No image"))),
			type,
			quality,
		),
	);
}

/** The code alone, black on white with a quiet border, as SVG. */
export function qrSvg(url: string): Blob {
	return new Blob([renderSVG(url, { border: 2 })], { type: "image/svg+xml" });
}

/** The code alone as a PNG, large enough to print or post. */
export async function qrPng(url: string, size = 1200): Promise<Blob> {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext("2d")!;
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, size, size);
	const border = size * 0.08;
	drawQr(ctx, url, border, border, size - 2 * border, "#000000");
	return blobOf(canvas, "image/png");
}

/**
 * The sign drawn at print size. A canvas does not wait for a font: the
 * first drawing asks for every weight it uses, and the second, once they
 * have arrived, is the one kept. Otherwise one face comes out in Heebo and
 * the other in whatever the system had.
 */
export async function signCanvas(spec: SignSpec): Promise<HTMLCanvasElement> {
	const canvas = document.createElement("canvas");
	canvas.width = SHEET.width;
	canvas.height = SHEET.height;
	const ctx = canvas.getContext("2d")!;
	drawSign(ctx, spec);
	await Promise.all(
		["400", "600", "800"].map((weight) =>
			document.fonts
				?.load(`${weight} 60px "Heebo Variable"`, spec.words.name)
				.catch(() => undefined),
		),
	);
	await document.fonts?.ready;
	drawSign(ctx, spec);
	return canvas;
}

export const signPng = async (spec: SignSpec) =>
	blobOf(await signCanvas(spec), "image/png");

export async function signPdf(spec: SignSpec): Promise<Blob> {
	const jpeg = await blobOf(await signCanvas(spec), "image/jpeg", 0.92);
	const bytes = pdfWithImage(new Uint8Array(await jpeg.arrayBuffer()), SHEET);
	return new Blob([bytes], { type: "application/pdf" });
}
