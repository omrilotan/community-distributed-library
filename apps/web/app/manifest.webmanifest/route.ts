import { strings } from "../../lib/i18n.ts";
import { library, libraryWords } from "../../lib/library.ts";
import { brandColours, iconHref } from "../../lib/accent.ts";

/**
 * The installable app's manifest, named after the library in the language it
 * opens in. The icons are the same mark for every library, in its colour.
 */
export async function GET(): Promise<Response> {
	const { defaultLocale, accent } = await library();
	const words = await libraryWords(defaultLocale);
	const short = words.shortName ?? strings(defaultLocale).appShort;
	const manifest = {
		name: words.name || short,
		short_name: short,
		...(words.tagline ? { description: words.tagline } : {}),
		lang: defaultLocale,
		dir: defaultLocale === "he" ? "rtl" : "ltr",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: "#f5f7f6",
		theme_color: brandColours(accent).light,
		icons: [
			{
				src: iconHref("/icon-192.png", accent),
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: iconHref("/icon-512.png", accent),
				sizes: "512x512",
				type: "image/png",
			},
			{
				src: iconHref("/icon.svg", accent),
				sizes: "any",
				type: "image/svg+xml",
				purpose: "any maskable",
			},
		],
	};
	return new Response(JSON.stringify(manifest), {
		headers: {
			"content-type": "application/manifest+json; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
}
