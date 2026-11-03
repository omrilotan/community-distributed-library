"use client";

import { useState } from "react";

/**
 * "More" that appends instead of replacing the page, and says so in the
 * address bar. Without JavaScript it is an ordinary link to a longer page;
 * with it, only the next slice is fetched and spliced into the grid, and the
 * URL is rewritten to describe everything now on screen — so coming back from
 * a book still shows the books you had uncovered.
 *
 * Above it, how far down the list the member has come, in words and as a
 * bar; on it, how many the next press brings, and when they are the last.
 */
export function MoreButton({
	query,
	shown,
	total,
	pageSize,
	most,
	locale,
	labels,
}: {
	/** The query without paging: the search, the tags. */
	query: Record<string, string>;
	/** How many entries the page is showing now. */
	shown: number;
	/** How many there are in all. */
	total: number;
	pageSize: number;
	/** The longest list one page draws. */
	most: number;
	locale: string;
	/** `{shown}`, `{total}` and `{n}` are filled in here, as More adds to the list. */
	labels: {
		shown: string;
		next: string;
		last: string;
		lastOne: string;
		loading: string;
	};
}) {
	const [at, setAt] = useState(shown);
	const [all, setAll] = useState(total);
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

	const number = new Intl.NumberFormat(locale);
	// There is always at least one more while this shows, whatever a count
	// taken a moment ago says.
	const left = Math.max(all - at, 1);
	const seen = Math.min(at, all);
	const action =
		left > pageSize
			? labels.next.replace("{n}", number.format(pageSize))
			: left === 1
				? labels.lastOne
				: labels.last.replace("{n}", number.format(left));
	const done = (seen / Math.max(all, 1)) * 100;

	return (
		<div className="more">
			<p className="more-shown" aria-live="polite">
				{labels.shown
					.replace("{shown}", number.format(seen))
					.replace("{total}", number.format(all))}
			</p>
			<div className="more-bar" aria-hidden="true">
				<span style={{ inlineSize: `${done}%` }} />
			</div>
			<a
				className="btn secondary"
				data-more
				data-total={all}
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
						const after = page.querySelector<HTMLElement>("[data-more]");
						// The count as of this slice, in case books came or went.
						if (after) setAll(Number(after.dataset.total) || all);
						setEnded(!after);
					} catch {
						setFailed(true);
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? labels.loading : action}
			</a>
		</div>
	);
}
