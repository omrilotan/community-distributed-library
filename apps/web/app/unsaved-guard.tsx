"use client";

import { useEffect } from "react";

/**
 * Leaving a page with a form half-edited loses the edit. Every form marked
 * `data-unsaved` is photographed as it loads; on the way out, one that no
 * longer matches, and was not just submitted, asks the browser to check.
 * The map's hidden coordinates count too, since the photo is the form data.
 */
export function UnsavedGuard() {
	useEffect(() => {
		const forms = Array.from(
			document.querySelectorAll<HTMLFormElement>("form[data-unsaved]"),
		);
		const picture = (form: HTMLFormElement) =>
			Array.from(new FormData(form), ([key, value]) => `${key}=${value}`)
				.sort()
				.join("&");
		const asLoaded = new Map(forms.map((form) => [form, picture(form)]));
		const submitted = new WeakSet<HTMLFormElement>();
		const onSubmit = (event: Event) =>
			submitted.add(event.target as HTMLFormElement);
		const onLeave = (event: BeforeUnloadEvent) => {
			const dirty = forms.some(
				(form) => !submitted.has(form) && picture(form) !== asLoaded.get(form),
			);
			if (!dirty) return;
			event.preventDefault();
			// Older engines listen to this rather than the cancel.
			event.returnValue = "";
		};
		for (const form of forms) form.addEventListener("submit", onSubmit);
		window.addEventListener("beforeunload", onLeave);
		return () => {
			for (const form of forms) form.removeEventListener("submit", onSubmit);
			window.removeEventListener("beforeunload", onLeave);
		};
	}, []);
	return null;
}
