import type { Metadata } from "next";
import { cookies } from "next/headers";
import { locales, strings, type Locale, type Strings } from "./i18n.ts";
import { libraryWords } from "./library.ts";

/**
 * A page's own title, ahead of the library's name: "Loans · Our Street
 * Library". Each names itself as its heading does, so a reader with several
 * open, or a screen reader arriving, knows which page this is (WCAG 2.4.2).
 */
export function titled(name: (t: Strings) => string) {
	return async function generateMetadata(): Promise<Metadata> {
		const requested = (await cookies()).get("locale")?.value;
		const locale: Locale = locales.includes(requested as Locale)
			? (requested as Locale)
			: "en";
		const t = strings(locale);
		const own = name(t);
		const { name: library } = await libraryWords(locale);
		return { title: library ? `${own} · ${library}` : own };
	};
}
