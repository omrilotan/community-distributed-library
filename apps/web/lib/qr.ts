import { renderSVG } from "uqr";

/** A link as a QR code to scan, ready for an image's `src`. */
export function qrFor(url: string): string {
	return `data:image/svg+xml;base64,${btoa(renderSVG(url, { border: 2 }))}`;
}
