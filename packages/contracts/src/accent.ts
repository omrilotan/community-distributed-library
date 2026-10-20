import { z } from "zod";

/**
 * A library's own colour, as the admin picked it: six hex digits. Missing,
 * the library wears the house green from @cdl/design's tokens.
 */
export const Accent = z
	.string()
	.regex(/^#[0-9a-fA-F]{6}$/)
	.transform((hex) => hex.toLowerCase());

/** The house accent; picking it is the same as picking none. */
export const HOUSE_ACCENT = "#0b7361";

/**
 * Colours an admin is offered, by name: the darker row of each pair in Flat
 * UI's original palette (flatuicolors.com/palette/defo). The first is the
 * house green, the logo's own colour, so picking it is picking none.
 */
export const SUGGESTED_ACCENTS = [
	{ id: "green-sea", hex: "#16a085", house: true },
	{ id: "nephritis", hex: "#27ae60" },
	{ id: "belize-hole", hex: "#2980b9" },
	{ id: "wisteria", hex: "#8e44ad" },
	{ id: "midnight-blue", hex: "#2c3e50" },
	{ id: "orange", hex: "#f39c12" },
	{ id: "pumpkin", hex: "#d35400" },
	{ id: "pomegranate", hex: "#c0392b" },
	{ id: "silver", hex: "#bdc3c7" },
	{ id: "asbestos", hex: "#7f8c8d" },
] as const;

export type SuggestedAccent = (typeof SUGGESTED_ACCENTS)[number]["id"];

/** The tokens a library's colour replaces, for each scheme. */
export interface AccentTokens {
	brand: string;
	accent: string;
	accentInk: string;
	accentSoft: string;
}

/**
 * The surfaces these colours sit on, as in packages/design/tokens.css. If those
 * change, change these with them: the contrast promised below is against them.
 */
const LIGHT = {
	bg: "#f5f7f6",
	surface: "#fcfdfc",
	ink: "#ffffff",
	/** A warning callout, where links sit too. */
	warnSoft: "#f5e7da",
};
const DARK = { bg: "#131817", surface: "#1b2120", warnSoft: "#33271d" };

/**
 * Any colour an admin picks becomes the same set of tokens the house green
 * has, keeping its hue and moving only its lightness, until every promise in
 * tokens.css holds: words and buttons at 4.5:1 on the page, on the soft
 * tint and in a warning callout, the library's name (large, bold) at 3:1. A pale yellow comes out as a
 * readable ochre, a near-black lifts to a readable shade in the dark.
 */
export function accentTokens(hex: string): {
	light: AccentTokens;
	dark: AccentTokens;
} {
	const [h, s, l] = toHsl(hex);

	const lightSoft = fromHsl(h, Math.min(s, 0.45), 0.9);
	const light = {
		brand: until(h, s, l, -1, (c) => contrast(c, LIGHT.bg) >= 3),
		accent: until(
			h,
			s,
			l,
			-1,
			(c) =>
				contrast(c, LIGHT.bg) >= 4.5 &&
				contrast(c, lightSoft) >= 4.5 &&
				contrast(c, LIGHT.warnSoft) >= 4.5 &&
				contrast(c, LIGHT.ink) >= 4.5,
		),
		accentInk: LIGHT.ink,
		accentSoft: lightSoft,
	};

	const darkSoft = fromHsl(h, Math.min(s, 0.3), 0.16);
	const darkInk = fromHsl(h, Math.min(s, 0.45), 0.08);
	const dark = {
		brand: until(h, s, l, 1, (c) => contrast(c, DARK.bg) >= 3),
		accent: until(
			h,
			s,
			l,
			1,
			(c) =>
				contrast(c, DARK.surface) >= 4.5 &&
				contrast(c, darkSoft) >= 4.5 &&
				contrast(c, DARK.warnSoft) >= 4.5 &&
				contrast(c, darkInk) >= 4.5,
		),
		accentInk: darkInk,
		accentSoft: darkSoft,
	};
	return { light, dark };
}

/** Step lightness one way until the colour passes; the far end always does. */
function until(
	h: number,
	s: number,
	l: number,
	step: 1 | -1,
	ok: (hex: string) => boolean,
): string {
	for (let at = l; at >= 0 && at <= 1; at += step * 0.01) {
		const hex = fromHsl(h, s, at);
		if (ok(hex)) return hex;
	}
	return step < 0 ? "#000000" : "#ffffff";
}

function channels(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
	const [r, g, b] = channels(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours. */
export function contrast(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [
		number,
		number,
	];
	return (x + 0.05) / (y + 0.05);
}

function toHsl(hex: string): [number, number, number] {
	const [r, g, b] = channels(hex).map((v) => v / 255) as [
		number,
		number,
		number,
	];
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h =
		max === r
			? (g - b) / d + (g < b ? 6 : 0)
			: max === g
				? (b - r) / d + 2
				: (r - g) / d + 4;
	return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
	const light = Math.min(1, Math.max(0, l));
	const a = s * Math.min(light, 1 - light);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const v = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(v * 255)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}
