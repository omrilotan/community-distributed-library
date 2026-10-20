"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";

/**
 * A row's actions behind one button, so a table keeps to its facts. A popover,
 * in the top layer: a table scrolls sideways on a phone and would clip a panel
 * that lived inside it. The browser dismisses it on Escape or a tap elsewhere;
 * this only places it by its button.
 */
export function RowMenu({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	const id = useId();
	const button = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = panel.current;
		if (!element) return;
		const place = () => {
			if (!element.matches(":popover-open") || !button.current) return;
			const box = button.current.getBoundingClientRect();
			// Hang from the button's outer edge, into the page.
			if (getComputedStyle(element).direction === "rtl") {
				element.style.left = `${box.left}px`;
				element.style.right = "auto";
			} else {
				element.style.right = `${window.innerWidth - box.right}px`;
				element.style.left = "auto";
			}
			// Below the button, unless that runs off the screen.
			const below = box.bottom + 4;
			element.style.top =
				below + element.offsetHeight > window.innerHeight
					? `${Math.max(4, box.top - 4 - element.offsetHeight)}px`
					: `${below}px`;
		};
		// A fixed panel would drift from its row as the page or the table
		// scrolls (tapping the button can scroll a wide table into view).
		element.addEventListener("toggle", place);
		window.addEventListener("scroll", place, true);
		window.addEventListener("resize", place);
		return () => {
			element.removeEventListener("toggle", place);
			window.removeEventListener("scroll", place, true);
			window.removeEventListener("resize", place);
		};
	}, []);

	return (
		<>
			<button
				ref={button}
				type="button"
				className="row-menu-button"
				popoverTarget={id}
				aria-label={label}
				title={label}
			>
				<DotsThree size={20} weight="bold" aria-hidden="true" />
			</button>
			<div ref={panel} id={id} popover="auto" className="row-menu">
				{children}
			</div>
		</>
	);
}
