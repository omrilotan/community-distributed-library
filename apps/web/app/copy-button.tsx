"use client";

import { useRef, useState } from "react";

/**
 * Copies one string — an address, a command — and says it did. The text is in
 * the markup as well, so it can still be read and selected where the clipboard
 * API is unavailable or refused.
 */
export function CopyButton({
	value,
	labels,
	block = false,
}: {
	value: string;
	labels: { copy: string; copied: string };
	/** A command on its own lines rather than an address on one. */
	block?: boolean;
}) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			// Refused or unavailable: leave the text on screen to select by hand.
			return;
		}
		setCopied(true);
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => setCopied(false), 2000);
	};

	return (
		<span className={`copyable${block ? " copyable-block" : ""}`}>
			{block ? (
				<pre dir="ltr" tabIndex={0}>
					<code>{value}</code>
				</pre>
			) : (
				<code dir="ltr">{value}</code>
			)}
			<button
				type="button"
				className="quiet copy-button"
				onClick={() => void copy()}
				aria-live="polite"
			>
				{copied ? labels.copied : labels.copy}
			</button>
		</span>
	);
}
