import { useEffect, useRef } from "react";

/**
 * Where to take the reader when what they pressed makes something to show
 * in its place: the button goes with its form, and focus would fall back to
 * the top of the page. Not on the first drawing, which nobody just asked for.
 */
export function useFocusWhenShown<Element extends HTMLElement>(shown: unknown) {
	const target = useRef<Element>(null);
	const first = useRef(true);
	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		if (shown) target.current?.focus();
	}, [shown]);
	return target;
}
