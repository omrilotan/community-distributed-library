"use client";

import { useState } from "react";
import type { WebhookCreated } from "@cdl/contracts";
import { useFocusWhenShown } from "../../lib/focus-shown.ts";

interface Labels {
	url: string;
	kinds: string;
	allKinds: string;
	create: string;
	secretOnce: string;
	copy: string;
	copied: string;
	failed: string;
	done: string;
}

/**
 * URL plus kinds; the secret shows once, then the page reloads with the hook
 * listed. The form posts without a script too; the secret then comes back on
 * the page, once, beside the hook already listed.
 */
export function WebhookForm({
	labels,
	kinds,
	made = null,
	failure = false,
}: {
	labels: Labels;
	/** What core publishes, handed down from the server (see TokenForm). */
	kinds: readonly string[];
	/** A secret made by the form posted without a script, shown here once. */
	made?: { secret: string } | null;
	/** The form, posted without a script, subscribed nothing. */
	failure?: boolean;
}) {
	const [secret, setSecret] = useState<string | null>(made?.secret ?? null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(failure);
	const [copied, setCopied] = useState(false);
	const shown = useFocusWhenShown<HTMLDivElement>(secret);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setBusy(true);
		setFailed(false);
		try {
			const response = await fetch("/api/me/webhooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					url: String(form.get("url") ?? ""),
					kinds: form.getAll("kinds").map(String),
				}),
			});
			if (!response.ok) throw new Error(String(response.status));
			setSecret(((await response.json()) as WebhookCreated).secret);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	if (secret) {
		return (
			<div className="token-created" ref={shown} tabIndex={-1}>
				<p className="muted">{labels.secretOnce}</p>
				<pre dir="ltr">
					<code>{secret}</code>
				</pre>
				<div className="actions">
					<button
						type="button"
						className="secondary"
						onClick={() => {
							void navigator.clipboard
								?.writeText(secret)
								.then(() => setCopied(true));
						}}
					>
						{copied ? labels.copied : labels.copy}
					</button>
					<a href="/connect#webhooks">{labels.done}</a>
				</div>
			</div>
		);
	}

	return (
		<form action="/api/me/webhooks" method="post" onSubmit={submit}>
			<label htmlFor="webhook-url">{labels.url}</label>
			<input
				id="webhook-url"
				name="url"
				type="url"
				dir="ltr"
				required
				placeholder="https://"
				maxLength={500}
			/>
			<p className="muted">{labels.kinds}</p>
			<fieldset className="scopes">
				{kinds.map((kind) => (
					<label className="check" key={kind}>
						<input name="kinds" type="checkbox" value={kind} />
						<code dir="ltr">{kind}</code>
					</label>
				))}
			</fieldset>
			<p className="muted">{labels.allKinds}</p>
			<div role="status">
				{failed ? <p className="muted">{labels.failed}</p> : null}
			</div>
			<button type="submit" disabled={busy}>
				{labels.create}
			</button>
		</form>
	);
}
