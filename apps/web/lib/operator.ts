import { env } from "cloudflare:workers";
import type { Locale } from "./i18n.ts";
import { libraryWords } from "./library.ts";

/**
 * Who the legal pages name, and where to write. UK data protection law wants a
 * controller somebody can identify and reach: a name plus a working address.
 * The library's admin answers for its data, not the moderators. If a library
 * ever has a named individual or a registered body behind it, this is the one
 * place to say so — both pages read from here.
 */
export async function operator(locale: Locale): Promise<string> {
	const { name } = await libraryWords(locale);
	return locale === "he" ? `מנהל/ת ${name}` : `The admin of ${name}`;
}

/** The address that reaches a person, and that the library writes from. */
export function contactAddress(): string {
	return (env as unknown as { FROM_ADDRESS?: string }).FROM_ADDRESS ?? "";
}
