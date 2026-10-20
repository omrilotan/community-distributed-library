/**
 * Search keys. Hebrew has no stemmer in SQLite, and niqqud and final forms
 * make the same word compare unequal — decision 0012. Normalising on write
 * and on query is the whole of the pilot's search cleverness.
 */
export function searchKey(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[֑-ׇ]/g, "") // niqqud and cantillation
		.replace(/[̀-ͯ]/g, "") // Latin diacritics
		.replace(
			/[ךםןףץ]/g,
			(final) => ({ ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" })[final]!,
		)
		.replace(/["'׳״]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * A LIKE pattern that finds `text` anywhere, taken literally: a % or _ a
 * member types is a character, not a wildcard. Use with ESCAPE '\\'.
 */
export function containing(text: string): string {
	return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
