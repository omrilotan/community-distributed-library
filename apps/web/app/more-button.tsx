"use client";

import { useState } from "react";

/**
 * "More" that appends instead of replacing the page, and says so in the
 * address bar. Without JavaScript it is an ordinary link to a longer page;
 * with it, only the next slice is fetched and spliced into the grid, and the
 * URL is rewritten to describe everything now on screen — so coming back from
 * a book still shows the books you had uncovered.
 */
export function MoreButton({
	query,
	shown,
	pageSize,
	most,
	label,
	loading,
}: {
	/** The query without paging: the search, the tags. */
	query: Record<string, string>;
	/** How many entries the page is showing now. */
	shown: number;
	pageSize: number;
	/** The longest list one page draws. */
	most: number;
	label: string;
	loading: string;
}) {
	const [at, setAt] = useState(shown);
	const [ended, setEnded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	if (ended) return null;

	const url = (params: Record<string, string | number>) => {
		const search = new URLSearchParams(query);
		for (const [key, value] of Object.entries(params)) {
			search.set(key, String(value));
		}
		return `/?${search.toString()}`;
	};
	// What the address says once the next slice is in: the list, one page longer.
	const longer = url({ shown: at + pageSize });
	// Where the link goes without JavaScript: the same, while one page can
	// draw that many; past that, the next slice on a page of its own, or the
	// link would draw the longest list again, and again.
	const next =
		at + pageSize <= most ? longer : url({ offset: at, limit: pageSize });

	return (
		<p className="more">
			<a
				className="btn secondary"
				data-more
				href={next}
				aria-busy={busy || undefined}
				onClick={async (event) => {
					if (failed) return; // let the browser navigate instead
					event.preventDefault();
					if (busy) return;
					setBusy(true);
					try {
						// Only the new slice, so nothing already on screen is fetched twice.
						const response = await fetch(url({ offset: at, limit: pageSize }), {
							headers: { accept: "text/html" },
						});
						if (!response.ok) throw new Error(String(response.status));
						const page = new DOMParser().parseFromString(
							await response.text(),
							"text/html",
						);
						const grid = document.getElementById("listing");
						const incoming = page.getElementById("listing");
						if (!grid || !incoming) throw new Error("no grid");
						for (const tile of Array.from(incoming.children)) {
							grid.appendChild(tile);
						}
						// Replace rather than push: Back should leave the list, not
						// walk back through every time somebody pressed More.
						history.replaceState(null, "", longer);
						setAt(at + pageSize);
						setEnded(!page.querySelector("[data-more]"));
					} catch {
						setFailed(true);
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? loading : label}
			</a>
		</p>
	);
}
