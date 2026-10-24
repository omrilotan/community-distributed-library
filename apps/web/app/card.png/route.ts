import { Accent } from "@cdl/contracts";
import { brandColours } from "../../lib/accent.ts";
import { cardPng } from "../../lib/card.ts";
import { locales, type Locale } from "../../lib/i18n.ts";
import { library, libraryWords } from "../../lib/library.ts";
import { appBase } from "../../lib/site.ts";

/** Drawn once per wording and colour in an isolate. */
const made = new Map<string, Uint8Array<ArrayBuffer>>();

/**
 * The card a shared link shows: lib/card.ts. `lang` picks the wording; the
 * address carries a version (cardHref) so a changed name or colour is a new
 * address, and what one address serves can be kept for good.
 */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const info = await library();
	const asked = url.searchParams.get("lang") as Locale;
	const locale: Locale = locales.includes(asked)
		? asked
		: (info.languages[0] ?? "en");
	const words = await libraryWords(locale);
	const name = words.name || "Community Library";
	const accent = Accent.safeParse(info.accent).success ? info.accent : null;
	const colour = brandColours(accent).light;
	const host = new URL(appBase() || url.origin).host;
	const key = `${locale}:${colour}:${name}:${words.tagline ?? ""}:${host}`;
	let body = made.get(key);
	if (!body) {
		body = await cardPng({ name, tagline: words.tagline, host, colour });
		if (made.size > 8) made.clear();
		made.set(key, body);
	}
	return new Response(body, {
		headers: {
			"content-type": "image/png",
			"cache-control": url.searchParams.has("v")
				? "public, max-age=31536000, immutable"
				: "public, max-age=3600",
		},
	});
}
