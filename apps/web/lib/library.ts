import {
	Accent,
	LIBRARY_TYPES,
	type LibraryTexts,
	type LibraryType,
} from "@cdl/contracts";
import { coreRaw } from "./core.ts";
import { locales, type Locale } from "./i18n.ts";
import { rememberLibraryType } from "./library-type.ts";

/** What the site needs to know about the library it belongs to. */
export interface LibraryInfo {
	name: string;
	type: LibraryType;
	languages: Locale[];
	defaultLocale: Locale;
	texts: LibraryTexts;
	/** Everyone lives close by: no areas, map or distances. */
	compact: boolean;
	/** The library's own colour; null wears the house green. */
	accent: string | null;
}

/** The library's words in one language, falling back to its plain name. */
export interface LibraryWords {
	name: string;
	shortName: string | null;
	tagline: string | null;
	about: string | null;
}

/**
 * Asked of core and kept for a minute: it is wanted on nearly every request
 * and changes about never. Saving the settings forgets it here at once; other
 * isolates catch up within the minute.
 */
// In development every request asks again, so a change (a library switched
// to things by the browser tests) shows at once.
const TTL_MS = process.env.NODE_ENV === "production" ? 60_000 : 0;
let known: { value: LibraryInfo; until: number } | null = null;

/** Core not answering: a page still renders, in English, without a name. */
const UNKNOWN: LibraryInfo = {
	name: "",
	type: "books",
	languages: ["en", "he"],
	defaultLocale: "en",
	texts: {},
	compact: false,
	accent: null,
};

export async function library(): Promise<LibraryInfo> {
	if (known && known.until > Date.now()) return known.value;
	try {
		const response = await coreRaw("/v1/community", {
			headers: { accept: "application/json" },
		});
		if (!response.ok) return UNKNOWN;
		const body = (await response.json()) as Partial<LibraryInfo>;
		const languages = (body.languages ?? []).filter((l): l is Locale =>
			locales.includes(l as Locale),
		);
		const value: LibraryInfo = {
			name: body.name ?? "",
			type: LIBRARY_TYPES.includes(body.type as LibraryType)
				? (body.type as LibraryType)
				: "books",
			languages: languages.length ? languages : UNKNOWN.languages,
			defaultLocale: locales.includes(body.defaultLocale as Locale)
				? (body.defaultLocale as Locale)
				: "en",
			texts: body.texts ?? {},
			compact: body.compact === true,
			// Only ever six hex digits: it is written into a style sheet.
			accent: Accent.safeParse(body.accent).data ?? null,
		};
		known = { value, until: Date.now() + TTL_MS };
		rememberLibraryType(value.type);
		return value;
	} catch {
		// Ask again next time.
		return UNKNOWN;
	}
}

export async function libraryWords(locale: Locale): Promise<LibraryWords> {
	const info = await library();
	const text = info.texts[locale] ?? {};
	return {
		name: text.name ?? info.name,
		shortName: text.shortName ?? null,
		tagline: text.tagline ?? null,
		about: text.about ?? null,
	};
}

export function forgetLibrary(): void {
	known = null;
}
