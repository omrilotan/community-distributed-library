"use client";

import { useState } from "react";
import type { TokenCreated } from "@cdl/contracts";
import { useFocusWhenShown } from "../../lib/focus-shown.ts";

interface Labels {
	name: string;
	create: string;
	shownOnce: string;
	copy: string;
	copied: string;
	failed: string;
	moderatorOnly: string;
}

/**
 * Name, scopes, one click: the token appears once, then only its summary
 * remains. The form posts without a script too; the token then comes back
 * on the page, once.
 */
export function TokenForm({
	labels,
	scopes,
	moderator,
	made = null,
	failure = false,
}: {
	labels: Labels;
	/**
	 * Every scope with its line in the reader's language, made on the server:
	 * the contracts package carries Zod, which the browser has no use for.
	 */
	scopes: { name: string; description: string }[];
	moderator: boolean;
	/** A token made by the form posted without a script, shown here once. */
	made?: { secret: string } | null;
	/** The form, posted without a script, made none. */
	failure?: boolean;
}) {
	const [token, setToken] = useState<string | null>(made?.secret ?? null);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(failure);
	const [copied, setCopied] = useState(false);
	const shown = useFocusWhenShown<HTMLDivElement>(token);

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const chosen = form.getAll("scopes").map(String);
		setBusy(true);
		setFailed(false);
		try {
			const response = await fetch("/api/me/tokens", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					clientName: String(form.get("name") ?? ""),
					scopes: chosen,
				}),
			});
			if (!response.ok) throw new Error(String(response.status));
			setToken(((await response.json()) as TokenCreated).token);
		} catch {
			setFailed(true);
		} finally {
			setBusy(false);
		}
	}

	if (token) {
		return (
			<div className="token-created" ref={shown} tabIndex={-1}>
				<p className="muted">{labels.shownOnce}</p>
				<pre dir="ltr">
					<code>{token}</code>
				</pre>
				<button
					type="button"
					className="secondary"
					onClick={() => {
						void navigator.clipboard
							?.writeText(token)
							.then(() => setCopied(true));
					}}
				>
					{copied ? labels.copied : labels.copy}
				</button>
			</div>
		);
	}

	return (
		<form action="/api/me/tokens" method="post" onSubmit={submit}>
			<label htmlFor="token-name">{labels.name}</label>
			<input
				id="token-name"
				name="name"
				type="text"
				dir="auto"
				required
				maxLength={80}
			/>
			<fieldset className="scopes">
				{scopes
					.filter(({ name }) => moderator || name !== "admin")
					.map(({ name, description }) => (
						<label className="check" key={name}>
							<input
								name="scopes"
								type="checkbox"
								value={name}
								defaultChecked={
									name === "catalogue:read" || name === "shelf:read"
								}
							/>
							<span>
								<code dir="ltr">{name}</code> · {description}
							</span>
						</label>
					))}
			</fieldset>
			<div role="status">
				{failed ? <p className="muted">{labels.failed}</p> : null}
			</div>
			<button type="submit" disabled={busy}>
				{labels.create}
			</button>
		</form>
	);
}
