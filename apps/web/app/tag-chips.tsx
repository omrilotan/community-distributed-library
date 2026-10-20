"use client";

import { useEffect } from "react";

/**
 * How long after the last tap the shelves reload. A person scanning the
 * chips takes under a second between taps; every tap starts this over, so
 * a run of taps is one reload.
 */
const SETTLE_MS = 900;

/** Where the shelves were when the reload left from inside Filters. */
const RETURN_KEY = "filters-return";

/**
 * Filter chips are links, and without script every tap is a reload. With
 * script, a tap flips the chip on the spot and the reload waits a moment
 * for the next tap, so "children, teens, by title" is one reload, not
 * three. Tags toggle (`data-tag`), the show chips toggle (`data-toggle`),
 * the order and distance chips pick one of their row (`data-param`). Every
 * value of a tag group chosen is no filter at all, folded away here as the
 * server folds it.
 *
 * A reload that leaves from inside Filters comes back where the page was,
 * with the panel folded away: the choices are made, the books are next.
 */
export function TagChips() {
	useEffect(() => {
		// Back from a change made inside Filters: in place.
		try {
			const back = JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? "null") as {
				href: string;
				y: number;
			} | null;
			sessionStorage.removeItem(RETURN_KEY);
			if (back && back.href === window.location.href)
				window.scrollTo(0, back.y);
		} catch {
			// No storage: the page starts at the top, as it would anyway.
		}

		const tags = new Map<string, boolean>();
		const params = new Map<string, string>();
		let fromPanel = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const settle = () => {
			timer = null;
			const url = new URL(window.location.href);
			const chosen = new Set(
				(url.searchParams.get("tags") ?? "").split(",").filter(Boolean),
			);
			for (const [slug, on] of tags) {
				if (on) chosen.add(slug);
				else chosen.delete(slug);
			}
			tags.clear();
			// A group with every value chosen narrows nothing: drop the lot.
			for (const row of document.querySelectorAll<HTMLElement>(
				"details.filters > .filters-panel > .filter-row",
			)) {
				const slugs = [...row.querySelectorAll<HTMLElement>("a.chip[data-tag]")]
					.map((chip) => chip.dataset.tag ?? "")
					.filter(Boolean);
				if (slugs.length && slugs.every((slug) => chosen.has(slug)))
					for (const slug of slugs) chosen.delete(slug);
			}
			if (chosen.size) url.searchParams.set("tags", [...chosen].join(","));
			else url.searchParams.delete("tags");
			for (const [key, value] of params) {
				if (value) url.searchParams.set(key, value);
				else url.searchParams.delete(key);
			}
			params.clear();
			// A new set of filters starts the list over.
			url.searchParams.delete("offset");
			url.searchParams.delete("shown");
			if (fromPanel) {
				try {
					sessionStorage.setItem(
						RETURN_KEY,
						JSON.stringify({ href: url.toString(), y: window.scrollY }),
					);
				} catch {
					// No storage: it comes back at the top.
				}
			}
			fromPanel = false;
			window.location.assign(url.toString());
		};

		const flip = (chip: HTMLElement, on: boolean) => {
			if (on) chip.setAttribute("aria-current", "true");
			else chip.removeAttribute("aria-current");
		};

		const onClick = (event: MouseEvent) => {
			// Plain taps only: a modified click means "open elsewhere".
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
				return;
			const chip = (event.target as Element | null)?.closest<HTMLElement>(
				"a.chip[data-tag], a.chip[data-toggle], a.chip[data-param]",
			);
			if (!chip) return;
			event.preventDefault();
			const { tag, toggle, param, value = "" } = chip.dataset;
			if (tag) {
				const on = chip.getAttribute("aria-current") !== "true";
				// Every chip for this tag, in the row above and in the panel.
				for (const same of document.querySelectorAll<HTMLElement>(
					`a.chip[data-tag="${CSS.escape(tag)}"]`,
				))
					flip(same, on);
				tags.set(tag, on);
			} else if (toggle) {
				const on = chip.getAttribute("aria-current") !== "true";
				flip(chip, on);
				params.set(toggle, on ? "1" : "");
			} else if (param) {
				// One of its row: this one on, the rest off.
				for (const other of chip
					.closest(".filter-chips")
					?.querySelectorAll<HTMLElement>(
						`a.chip[data-param="${CSS.escape(param)}"]`,
					) ?? [])
					flip(other, other === chip);
				params.set(param, value);
			}
			if (chip.closest("details.filters")) fromPanel = true;
			document.documentElement.setAttribute("data-filters-settling", "");
			if (timer) clearTimeout(timer);
			timer = setTimeout(settle, SETTLE_MS);
		};

		document.addEventListener("click", onClick);
		return () => {
			document.removeEventListener("click", onClick);
			if (timer) clearTimeout(timer);
		};
	}, []);
	return null;
}
