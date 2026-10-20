"use client";

import { useState } from "react";
import type { Invite } from "@cdl/contracts";
import { useFocusWhenShown } from "../lib/focus-shown.ts";

interface Labels {
	create: string;
	another: string;
	creating: string;
	failed: string;
	tooMany: string;
	shownOnce: string;
	copy: string;
	copied: string;
	share: string;
}

/**
 * The link exists once. Only its hash is stored, so if it is not sent now it
 * is gone — which is why this shows it large and offers to send it straight
 * into a chat. Another link can follow straight away, one per neighbour; the
 * one on screen is replaced, so it has to be sent first.
 */
export function InviteForm({
	labels,
	message,
	made = null,
	failure = null,
}: {
	labels: Labels;
	/** What to say alongside the link when sharing. */
	message: string;
	/** A link made by the form posted without a script, shown here once. */
	made?: Pick<Invite, "url"> | null;
	/** Why the form, posted without a script, made none. */
	failure?: "many" | "failed" | null;
}) {
	const [invite, setInvite] = useState<Pick<Invite, "url"> | null>(made);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(
		failure === "many"
			? labels.tooMany
			: failure === "failed"
				? labels.failed
				: null,
	);
	const [copied, setCopied] = useState(false);
	const shown = useFocusWhenShown<HTMLDivElement>(invite);

	// Posts as a form, so it works without a script; with one, it stays on
	// the page and shows the link here.
	const asks = (label: string, className?: string) => (
		<form
			action="/api/me/invites"
			method="post"
			className="inline"
			onSubmit={(event) => {
				event.preventDefault();
				void create();
			}}
		>
			<button type="submit" className={className} disabled={busy}>
				{busy ? labels.creating : label}
			</button>
		</form>
	);

	async function create() {
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/me/invites", { method: "POST" });
			if (response.status === 409) {
				setError(labels.tooMany);
				return;
			}
			if (!response.ok) throw new Error(String(response.status));
			setInvite((await response.json()) as Invite);
			setCopied(false);
		} catch {
			setError(labels.failed);
		} finally {
			setBusy(false);
		}
	}

	if (invite) {
		const text = `${message}\n${invite.url}`;
		return (
			<div className="token-created" ref={shown} tabIndex={-1}>
				<p className="muted">{labels.shownOnce}</p>
				<pre dir="ltr">
					<code>{invite.url}</code>
				</pre>
				<div className="actions">
					<button
						type="button"
						className="secondary"
						onClick={() => {
							if (typeof navigator.share === "function") {
								void navigator
									// The link goes in `url` only: apps add it to the text themselves.
									.share({ text: message, url: invite.url })
									.catch(() => undefined);
							} else {
								window.open(
									`https://wa.me/?text=${encodeURIComponent(text)}`,
									"_blank",
									"noopener",
								);
							}
						}}
					>
						{labels.share}
					</button>
					<button
						type="button"
						className="link"
						onClick={() => {
							void navigator.clipboard
								?.writeText(invite.url)
								.then(() => setCopied(true))
								.catch(() => undefined);
						}}
					>
						{copied ? labels.copied : labels.copy}
					</button>
					{asks(labels.another, "link")}
				</div>
				<div role="status">
					{error ? <p className="muted">{error}</p> : null}
				</div>
			</div>
		);
	}

	return (
		<div>
			{asks(labels.create)}
			<div role="status">{error ? <p className="muted">{error}</p> : null}</div>
		</div>
	);
}
