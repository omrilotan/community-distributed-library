import { brandColours } from "./accent.ts";
import type { Locale } from "./i18n.ts";
import { library, libraryWords } from "./library.ts";
import { appBase } from "./site.ts";

/**
 * The link card's address (app/card.png), changed with what is drawn on it,
 * so an app that kept an old card asks again once the name, the line or the
 * colour changes.
 */
export async function cardHref(locale: Locale): Promise<string> {
	const info = await library();
	const words = await libraryWords(locale);
	const drawn = [
		brandColours(info.accent).light,
		words.name,
		words.tagline ?? "",
	].join("\n");
	// FNV-1a: short, stable, and enough to tell two wordings apart.
	let hash = 0x811c9dc5;
	for (let i = 0; i < drawn.length; i++) {
		hash ^= drawn.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	const version = (hash >>> 0).toString(36);
	return `${appBase()}/card.png?lang=${locale}&v=${version}`;
}
