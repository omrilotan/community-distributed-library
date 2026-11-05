import { continueRender, delayRender, staticFile } from "remotion";

/**
 * The website's look (packages/design/tokens.css, apps/landing): a
 * barely-green white, one green for what matters, hairlines, no shadows,
 * corners slightly softened, and Outfit.
 */
export const palette = {
	bg: "#f5f7f6",
	surface: "#fcfdfc",
	ink: "#1d2624",
	muted: "#57635f",
	line: "#dfe5e3",
	lineStrong: "#c2ccc8",
	brand: "#16a085",
	accent: "#0b7361",
	accentInk: "#ffffff",
	accentSoft: "#dcefe9",
	warn: "#98501f",
	warnSoft: "#f5e7da",
} as const;

export const radius = { box: 16, small: 10 } as const;

export const font = "Outfit, system-ui, sans-serif";
export const mono = '"SF Mono", Menlo, ui-monospace, monospace';

// The same face the website serves, from public/, before the first frame.
const outfit = new FontFace(
	"Outfit",
	`url(${staticFile("fonts/outfit-latin.woff2")}) format("woff2")`,
	{ weight: "400 700" },
);
const waiting = delayRender("Outfit");
outfit
	.load()
	.then(() => {
		document.fonts.add(outfit);
		continueRender(waiting);
	})
	.catch((error: unknown) => {
		console.error(error);
		continueRender(waiting);
	});

export type Shape = "landscape" | "portrait";

/**
 * Where things go in each shape. In portrait, Reels, TikTok and Shorts lay
 * their own buttons over the bottom fifth and a strip on the right, so the
 * stage and the captions stay clear of them.
 */
export const frames = {
	landscape: {
		width: 1920,
		height: 1080,
		gutter: 96,
		stage: { top: 72, bottom: 860 },
		captionBottom: 56,
		captionSize: 44,
		captionChars: 58,
		title: 96,
		body: 36,
	},
	portrait: {
		width: 1080,
		height: 1920,
		gutter: 56,
		stage: { top: 150, bottom: 1250 },
		captionBottom: 1920 - 1500,
		captionSize: 52,
		captionChars: 30,
		title: 92,
		body: 38,
	},
} as const;

export type Frame = (typeof frames)[Shape];

export const FPS = 30;
/** Quiet before the first word, and the end card held after the last. */
export const LEAD = 0.4;
export const TAIL = 2.6;
