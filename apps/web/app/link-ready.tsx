"use client";

import { useState } from "react";
import { qrFor } from "../lib/qr.ts";
import {
	qrPng,
	qrSvg,
	save,
	signCanvas,
	signPdf,
	signPng,
} from "../lib/downloads.ts";
import type { SignSpec } from "../lib/sign.ts";

export interface LinkReadyLabels {
	share: string;
	copy: string;
	copied: string;
	showQr: string;
	hideQr: string;
	qrAlt: string;
	downloadPng: string;
	downloadSvg: string;
}

export interface SignLabels {
	make: string;
	hint: string;
	downloadPdf: string;
	downloadPng: string;
	preview: string;
	failed: string;
}

/**
 * A link that is shown once, and every way to pass it on: the phone's share
 * sheet (a chat app, mostly), the clipboard, a code to scan and that code as
 * a picture. With `sign`, a moderator can also make a sign to print for an
 * event. Everything is made here in the browser; the link goes nowhere.
 */
export function LinkReady({
	url,
	message,
	labels,
	filename,
	note = null,
	sign = null,
}: {
	url: string;
	/** What to say alongside the link when sharing. */
	message: string;
	labels: LinkReadyLabels;
	/** Downloads are named after it: "join-our-street". */
	filename: string;
	/** When it works, said plainly under the link. */
	note?: string | null;
	sign?: { spec: Omit<SignSpec, "url">; labels: SignLabels } | null;
}) {
	const [copied, setCopied] = useState(false);
	const [qr, setQr] = useState(false);
	const [preview, setPreview] = useState<string | null>(null);
	const [signError, setSignError] = useState(false);
	const spec: SignSpec | null = sign ? { ...sign.spec, url } : null;

	const share = () => {
		if (typeof navigator.share === "function") {
			void navigator
				// The link goes in `url` only: apps add it to the text themselves.
				.share({ text: message, url })
				.catch(() => undefined);
		} else {
			window.open(
				`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`,
				"_blank",
				"noopener",
			);
		}
	};

	const makeSign = async () => {
		if (!spec) return;
		setSignError(false);
		try {
			const canvas = await signCanvas(spec);
			setPreview(canvas.toDataURL("image/jpeg", 0.6));
		} catch {
			setSignError(true);
		}
	};

	const download = async (make: () => Promise<Blob> | Blob, name: string) => {
		try {
			save(await make(), name);
		} catch {
			setSignError(true);
		}
	};

	return (
		<div className="link-ready">
			<pre dir="ltr">
				<code>{url}</code>
			</pre>
			{note ? <p className="muted">{note}</p> : null}
			<div className="actions">
				<button type="button" className="secondary" onClick={share}>
					{labels.share}
				</button>
				<button
					type="button"
					className="link"
					onClick={() => {
						void navigator.clipboard
							?.writeText(url)
							.then(() => setCopied(true))
							.catch(() => undefined);
					}}
				>
					{copied ? labels.copied : labels.copy}
				</button>
				<button
					type="button"
					className="link"
					aria-expanded={qr}
					onClick={() => setQr(!qr)}
				>
					{qr ? labels.hideQr : labels.showQr}
				</button>
			</div>

			{qr ? (
				<div className="invite-qr">
					<img className="device-qr" src={qrFor(url)} alt={labels.qrAlt} />
					<div className="actions">
						<button
							type="button"
							className="link"
							onClick={() =>
								void download(() => qrPng(url), `${filename}-qr.png`)
							}
						>
							{labels.downloadPng}
						</button>
						<button
							type="button"
							className="link"
							onClick={() =>
								void download(() => qrSvg(url), `${filename}-qr.svg`)
							}
						>
							{labels.downloadSvg}
						</button>
					</div>
				</div>
			) : null}

			{sign && spec ? (
				<div className="join-sign">
					{preview ? (
						<>
							<img
								className="sign-preview"
								src={preview}
								alt={sign.labels.preview}
							/>
							<p className="muted">{sign.labels.hint}</p>
							<div className="actions">
								<button
									type="button"
									onClick={() =>
										void download(() => signPdf(spec), `${filename}-sign.pdf`)
									}
								>
									{sign.labels.downloadPdf}
								</button>
								<button
									type="button"
									className="secondary"
									onClick={() =>
										void download(() => signPng(spec), `${filename}-sign.png`)
									}
								>
									{sign.labels.downloadPng}
								</button>
							</div>
						</>
					) : (
						<button
							type="button"
							className="secondary"
							onClick={() => void makeSign()}
						>
							{sign.labels.make}
						</button>
					)}
					<div role="status">
						{signError ? <p className="muted">{sign.labels.failed}</p> : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
