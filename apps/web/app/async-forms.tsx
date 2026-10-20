"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const BACKGROUND_HEADER = "x-cdl-form";

/**
 * Forms marked `data-async` send in the background: the page stays where it
 * is, the form is locked and dimmed until the answer comes, and then the
 * page's data is fetched again in place. A word in the form says whether it
 * worked. Without scripts they are ordinary forms, and still work.
 */
export function AsyncForms({
	labels,
}: {
	labels: { saving: string; saved: string; failed: string };
}) {
	const router = useRouter();

	useEffect(() => {
		const status = (form: HTMLFormElement, text: string, failed = false) => {
			let line = form.querySelector<HTMLElement>(":scope > .form-status");
			if (!line) {
				line = document.createElement("p");
				line.className = "form-status";
				line.setAttribute("role", "status");
				form.appendChild(line);
			}
			line.textContent = text;
			line.classList.toggle("form-status-failed", failed);
		};
		const onSubmit = (event: SubmitEvent) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement) || !("async" in form.dataset))
				return;
			event.preventDefault();
			if (form.dataset.busy === "true") return;
			const body = new FormData(form, event.submitter);
			form.dataset.busy = "true";
			form.setAttribute("aria-busy", "true");
			form.inert = true;
			status(form, labels.saving);
			// The attribute, not form.action: a field named "action" shadows it.
			const target = new URL(
				form.getAttribute("action") ?? "",
				window.location.href,
			);
			fetch(target, {
				method: "POST",
				body,
				headers: { [BACKGROUND_HEADER]: "background" },
				credentials: "same-origin",
			})
				.then(async (response) => {
					const answer = (await response.json().catch(() => null)) as {
						ok?: boolean;
						location?: string;
					} | null;
					if (answer?.location === "/login") {
						window.location.assign("/login");
						return;
					}
					if (response.ok && answer?.ok) {
						status(form, labels.saved);
						router.refresh();
					} else {
						status(form, labels.failed, true);
					}
				})
				.catch(() => status(form, labels.failed, true))
				.finally(() => {
					delete form.dataset.busy;
					form.removeAttribute("aria-busy");
					form.inert = false;
				});
		};
		// Capture, so the page-wide guard sees the submit already handled.
		document.addEventListener("submit", onSubmit, true);
		return () => document.removeEventListener("submit", onSubmit, true);
	}, [labels, router]);

	return null;
}
