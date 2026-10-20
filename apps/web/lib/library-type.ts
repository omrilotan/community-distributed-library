import type { LibraryType } from "@cdl/contracts";

/**
 * The type of the library this app serves, as last read from core. Set by
 * library() (which the middleware calls on every request) and read by
 * strings(), which is synchronous; a type is fixed when a library opens, so
 * the last value read is the value.
 */
let current: LibraryType = "books";

export function rememberLibraryType(type: LibraryType): void {
	current = type;
}

export function libraryType(): LibraryType {
	return current;
}
