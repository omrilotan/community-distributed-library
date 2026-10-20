"use client";

import { useEffect } from "react";

/**
 * Every form on the site sends once. From the moment it is submitted until
 * the answer arrives (the next page, with the result or the error), it is
 * locked and dimmed, so a slow save does not invite a second tap. Forms that
 * send with a script of their own cancel the submit and keep their own state;
 * they are left alone. Coming back with the Back button unlocks everything.
 */
const UNLOCK_AFTER_MS = 30_000;

export function FormGuard() {
	useEffect(() => {
		const lock = (form: HTMLFormElement) => {
			form.dataset.busy = "true";
			form.setAttribute("aria-busy", "true");
			form.inert = true;
			// A request the browser gave up on without a page: never stay stuck.
			window.setTimeout(() => unlock(form), UNLOCK_AFTER_MS);
		};
		const unlock = (form: HTMLFormElement) => {
			delete form.dataset.busy;
			form.removeAttribute("aria-busy");
			form.inert = false;
		};
		const onSubmit = (event: SubmitEvent) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement)) return;
			// Already on its way: a second submit is the double tap.
			if (form.dataset.busy === "true") {
				event.preventDefault();
				return;
			}
			if (event.defaultPrevented) return;
			if (form.target && form.target !== "_self") return;
			// A form that answers with a file leaves the page where it is: no lock.
			if (form.dataset.download !== undefined) return;
			lock(form);
		};
		const onShow = () => {
			for (const form of document.querySelectorAll<HTMLFormElement>(
				"form[data-busy]",
			)) {
				unlock(form);
			}
		};
		document.addEventListener("submit", onSubmit);
		window.addEventListener("pageshow", onShow);
		// Says it is listening, for anything that needs to know (the tests do).
		document.documentElement.dataset.formGuard = "on";
		return () => {
			delete document.documentElement.dataset.formGuard;
			document.removeEventListener("submit", onSubmit);
			window.removeEventListener("pageshow", onShow);
		};
	}, []);
	return null;
}
