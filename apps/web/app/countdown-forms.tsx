"use client";

import { useEffect } from "react";

/** How long a request waits before it goes, in seconds. */
const SECONDS = 3;

/**
 * Forms marked `data-countdown` send a moment after their button is pressed,
 * not at once. The button counts down ("Cancel · 3", "· 2", "· 1"), and
 * pressing it again takes the request back: asking a neighbour is a message
 * to them, so a slip of the thumb gets a moment to be undone. Without
 * scripts the form sends at once, as any form does.
 */
export function CountdownForms({
	labels,
}: {
	labels: {
		cancel: string;
		/** Read out each second: the request goes in this many seconds. */
		sendingIn: string[];
		cancelled: string;
	};
}) {
	useEffect(() => {
		const running = new Map<
			HTMLFormElement,
			{ timer: number; button: HTMLButtonElement; label: string }
		>();

		// Said to screen readers too: the button's own text changes silently.
		const say = (form: HTMLFormElement, text: string) => {
			let line = form.querySelector<HTMLElement>(":scope > .countdown-status");
			if (!line) {
				line = document.createElement("p");
				line.className = "countdown-status sr-only";
				line.setAttribute("role", "status");
				form.appendChild(line);
			}
			line.textContent = text;
		};

		const stop = (form: HTMLFormElement) => {
			const run = running.get(form);
			if (!run) return;
			window.clearInterval(run.timer);
			run.button.textContent = run.label;
			form.classList.remove("counting");
			running.delete(form);
		};

		const onSubmit = (event: SubmitEvent) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement) || !("countdown" in form.dataset))
				return;
			// The countdown's own send, once it reaches zero: let it go on to
			// the form guard and the server as any submit does.
			if (form.dataset.counted === "true") {
				delete form.dataset.counted;
				return;
			}
			event.preventDefault();
			if (running.has(form)) {
				stop(form);
				say(form, labels.cancelled);
				return;
			}
			const button =
				event.submitter instanceof HTMLButtonElement
					? event.submitter
					: form.querySelector<HTMLButtonElement>("button[type=submit]");
			if (!button) return;
			let left = SECONDS;
			const tick = () => {
				if (left === 0) {
					stop(form);
					form.dataset.counted = "true";
					form.requestSubmit(button);
					return;
				}
				button.textContent = `${labels.cancel} · ${left}`;
				say(form, labels.sendingIn[left - 1] ?? "");
				left -= 1;
			};
			running.set(form, {
				timer: window.setInterval(tick, 1000),
				button,
				label: button.textContent ?? "",
			});
			form.classList.add("counting");
			tick();
		};

		// Leaving the page takes back whatever was still counting.
		const onHide = () => {
			for (const form of [...running.keys()]) stop(form);
		};

		// Captured, so it answers before the form guard locks the form.
		document.addEventListener("submit", onSubmit, true);
		window.addEventListener("pagehide", onHide);
		document.documentElement.dataset.countdown = "on";
		return () => {
			onHide();
			delete document.documentElement.dataset.countdown;
			document.removeEventListener("submit", onSubmit, true);
			window.removeEventListener("pagehide", onHide);
		};
	}, [labels]);
	return null;
}
