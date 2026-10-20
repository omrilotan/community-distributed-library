import { LibraryTexts, type LibraryType } from "@cdl/contracts";
import type { Env } from "./env.ts";

export type Locale = "en" | "he";

/** The library this database belongs to: one library per deployment. */
export interface Library {
	id: string;
	slug: string;
	name: string;
	type: LibraryType;
	languages: Locale[];
	defaultLocale: Locale;
	compact: boolean;
	texts: LibraryTexts;
	/** The library's own colour; null wears the house green. */
	accent: string | null;
}

/**
 * Each library is its own deployment with its own database, so a database
 * holds exactly one community. Anything that would otherwise reach for "the
 * first community" asks here, and finding none, or more than one, is an error
 * rather than a guess.
 */
export async function theLibrary(env: Env): Promise<Library> {
	const { results } = await env.DB.prepare(
		"SELECT id, slug, name, type, languages, default_locale, compact, texts, accent FROM communities LIMIT 2",
	).all<{
		id: string;
		slug: string;
		name: string;
		type: LibraryType;
		languages: string;
		default_locale: Locale;
		compact: number;
		texts: string;
		accent: string | null;
	}>();
	const [row, another] = results;
	if (!row || another)
		throw new Error(
			`Expected one library in this database, found ${row ? "several" : "none"}`,
		);
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		type: row.type,
		languages: row.languages.split(",") as Locale[],
		defaultLocale: row.default_locale,
		compact: row.compact === 1,
		texts: readTexts(row.texts),
		accent: row.accent,
	};
}

/** Stored words, read leniently: anything that does not fit is left out. */
export function readTexts(stored: string): LibraryTexts {
	try {
		const parsed = LibraryTexts.safeParse(JSON.parse(stored));
		return parsed.success ? parsed.data : {};
	} catch {
		return {};
	}
}
