import { locales, type Locale } from "../../../lib/i18n.ts";
import { library } from "../../../lib/library.ts";
import { safePath } from "../../../lib/safe-path.ts";

/**
 * Switch language and stay put. Reading in the other language should not cost
 * you the page you were on, let alone the search you had typed.
 */
export async function GET(
	request: Request,
	context: { params: Promise<{ locale: string }> },
): Promise<Response> {
	const { locale } = await context.params;
	const { languages, defaultLocale } = await library();
	// Only a language the library offers; anything else, its own.
	const chosen: Locale =
		locales.includes(locale as Locale) && languages.includes(locale as Locale)
			? (locale as Locale)
			: defaultLocale;

	return new Response(null, {
		status: 303,
		headers: {
			location: whereTheyWere(request),
			"set-cookie": `locale=${chosen}; Path=/; Max-Age=31536000; SameSite=Lax`,
		},
	});
}

/**
 * The referrer carries the query string, so it is preferred; `back` is there
 * for browsers that send no referrer. Both are checked to be a path on this
 * site, because a redirect target from outside is an open redirect.
 */
function whereTheyWere(request: Request): string {
	const url = new URL(request.url);
	const referer = request.headers.get("referer");
	if (referer) {
		try {
			const from = new URL(referer);
			if (from.origin === url.origin && !from.pathname.startsWith("/locale/")) {
				// Same origin, yet "//elsewhere.example" is a pathname a URL can hold.
				return safePath(`${from.pathname}${from.search}`);
			}
		} catch {
			// Unparseable referrer: fall through to `back`.
		}
	}
	// A path, not a URL: "//elsewhere.example" is a URL to a browser.
	return safePath(url.searchParams.get("back"));
}
