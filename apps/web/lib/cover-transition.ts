import type { CSSProperties } from "react";

/**
 * The same name on a tile's cover in the list and on the cover of its own
 * page, so the browser carries one into the other as the page changes
 * (globals.css turns cross-document view transitions on). A name must be a
 * CSS identifier and unique on the page: one per work.
 */
export function coverTransition(workId: string): CSSProperties {
	return {
		viewTransitionName: `cover-${workId.replace(/[^\w-]/g, "_")}`,
	} as CSSProperties;
}
