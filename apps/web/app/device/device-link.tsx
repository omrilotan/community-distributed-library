"use client";

import { useState } from "react";
import { dateFormat } from "../../lib/dates.ts";
import { useFocusWhenShown } from "../../lib/focus-shown.ts";
import { CopyButton } from "../copy-button.tsx";

interface Link {
	url: string;
	expiresAt: number;
	qr: string;
}

/**
 * Makes the link only when asked: it signs in as this member, so it is not
 * sitting on the page for whoever looks over a shoulder. The form posts
 * without a script too; the link then comes back on the page, once.
 */
export function DeviceLink({
	labels,
	locale,
	made = null,
	failure = null,
}: {
	locale: string;
	/** A link made by the form posted without a script, shown here once. */
	made?: Link | null;
	/** Why the form, posted without a script, made none. */
	failure?: "many" | "failed" | null;
	labels: {
		create: string;
		again: string;
		creating: string;
		failed: string;
		tooMany: string;
		scan: string;
		orCopy: string;
		/** "{time}" stands for when the link stops working. */
		until: string;
		copy: string;
		copied: string;
		qrAlt: string;
	};
}) {
	const [link, setLink] = useState<Link | null>(made);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(
		failure === "many"
			? labels.tooMany
			: failure === "failed"
				? labels.failed
				: null,
	);

	const shown = useFocusWhenShown<HTMLDivElement>(link);

	const create = async () => {
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/me/device-link", {
				method: "POST",
				credentials: "same-origin",
			});
			if (response.status === 401) {
				window.location.href = "/login";
				return;
			}
			if (!response.ok) {
				setError(response.status === 429 ? labels.tooMany : labels.failed);
				return;
			}
			setLink((await response.json()) as Link);
		} catch {
			setError(labels.failed);
		} finally {
			setBusy(false);
		}
	};

	const until = link
		? dateFormat(locale, { timeStyle: "short" }).format(link.expiresAt * 1000)
		: "";

	return (
		<div className="device-link">
			{link ? (
				<div ref={shown} tabIndex={-1}>
					<p>{labels.scan}</p>
					<img className="device-qr" src={link.qr} alt={labels.qrAlt} />
					<p>{labels.orCopy}</p>
					<CopyButton
						value={link.url}
						labels={{ copy: labels.copy, copied: labels.copied }}
					/>
					<p className="muted">{labels.until.replace("{time}", until)}</p>
				</div>
			) : null}
			<form
				action="/api/me/device-link"
				method="post"
				onSubmit={(event) => {
					event.preventDefault();
					void create();
				}}
			>
				<button
					type="submit"
					className={link ? "secondary" : undefined}
					disabled={busy}
				>
					{busy ? labels.creating : link ? labels.again : labels.create}
				</button>
			</form>
			<div role="status">{error ? <p className="muted">{error}</p> : null}</div>
		</div>
	);
}
