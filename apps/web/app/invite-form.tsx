"use client";

import { useState } from "react";
import type { Invite } from "@cdl/contracts";
import { useFocusWhenShown } from "../lib/focus-shown.ts";
import { LinkReady } from "./link-ready.tsx";

interface Labels {
	create: string;
	another: string;
	creating: string;
	failed: string;
	tooMany: string;
	/** Said under a new link: shown this once, or there to show again. */
	shownOnce: string;
	shownAgain: string;
	copy: string;
	copied: string;
	share: string;
	showQr: string;
	hideQr: string;
	qrAlt: string;
	downloadPng: string;
	downloadSvg: string;
}

/**
 * A new link, shown large with every way to pass it on: straight into a
 * chat, copied, or as a code to scan (lib/downloads.ts). Where the library
 * keeps a sealed copy, the list under the form shows it again while it
 * waits; where it does not, only its hash is stored and this is the one
 * time it is seen. Another link can follow straight away, one per neighbour.
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
	made?: (Pick<Invite, "url"> & { showable?: boolean }) | null;
	/** Why the form, posted without a script, made none. */
	failure?: "many" | "failed" | null;
}) {
	const [invite, setInvite] = useState<
		(Pick<Invite, "url"> & { showable?: boolean }) | null
	>(made);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(
		failure === "many"
			? labels.tooMany
			: failure === "failed"
				? labels.failed
				: null,
	);
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
		} catch {
			setError(labels.failed);
		} finally {
			setBusy(false);
		}
	}

	if (invite) {
		return (
			<div className="token-created" ref={shown} tabIndex={-1}>
				<p className="muted">
					{invite.showable ? labels.shownAgain : labels.shownOnce}
				</p>
				<LinkReady
					url={invite.url}
					message={message}
					filename="invite"
					labels={labels}
				/>
				<div className="actions">{asks(labels.another, "link")}</div>
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
