import { accentTokens, type AccentTokens } from "@cdl/contracts";

/**
 * The style sheet that dresses the site in the library's own colour: the four
 * accent tokens from packages/design/tokens.css, for each scheme. Null, the
 * house green, needs none.
 */
export function accentCss(accent: string | null): string | null {
	if (!accent) return null;
	const { light, dark } = accentTokens(accent);
	return `:root{${declare(light)}}@media (prefers-color-scheme: dark){:root{${declare(dark)}}}`;
}

function declare(tokens: AccentTokens): string {
	return `--brand:${tokens.brand};--accent:${tokens.accent};--accent-ink:${tokens.accentInk};--accent-soft:${tokens.accentSoft};`;
}

/** The house green the mark and the installed app wear, in both schemes. */
const HOUSE_BRAND = "#16a085";

/**
 * The colour of the library's mark and of the installed app's bars: the
 * library's own, at the shade its name takes, or the house green.
 */
export function brandColours(accent: string | null): {
	light: string;
	dark: string;
} {
	if (!accent) return { light: HOUSE_BRAND, dark: HOUSE_BRAND };
	const { light, dark } = accentTokens(accent);
	return { light: light.brand, dark: dark.brand };
}

/**
 * An icon's address, changed with the colour, so a browser that kept the old
 * one asks again. The icon itself is always drawn in the current colour.
 */
export function iconHref(path: string, accent: string | null): string {
	return accent ? `${path}?v=${accent.slice(1)}` : path;
}
