"use client";

import { useEffect, useState } from "react";

export interface IsbnLabels {
	isbn: string;
	lookingUp: string;
	notFound: string;
	notIsbn: string;
	found: string;
	placeholder: string;
}

interface Preview {
	title: string;
	authors: string[];
	coverUrl: string | null;
}

/**
 * An ISBN, looked up as it is typed. Barcode scanning lived here until the
 * providers turned out not to know this community's books — see decision 0026.
 * The field stays because a foreign edition still resolves from its number.
 */
export function IsbnField({
	labels,
	initial = "",
}: {
	labels: IsbnLabels;
	initial?: string;
}) {
	const [value, setValue] = useState(initial);
	const [preview, setPreview] = useState<
		Preview | null | "loading" | "missing" | "notIsbn"
	>(null);

	// Look up any complete ISBN, however it arrived.
	useEffect(() => {
		const digits = value.replace(/\D/g, "");
		if (digits.length !== 13) {
			setPreview(null);
			return;
		}
		// 13 digits that are not 978/979 are some other barcode (Danacode, EAN).
		if (!/^97[89]/.test(digits)) {
			setPreview("notIsbn");
			return;
		}
		let cancelled = false;
		setPreview("loading");
		fetch(`/api/lookup/${digits}`)
			.then((response) =>
				response.ok ? (response.json() as Promise<Preview>) : null,
			)
			.then((found) => {
				if (!cancelled) setPreview(found ?? "missing");
			})
			.catch(() => {
				if (!cancelled) setPreview("missing");
			});
		return () => {
			cancelled = true;
		};
	}, [value]);

	return (
		<div>
			<label htmlFor="isbn13">{labels.isbn}</label>
			<input
				id="isbn13"
				name="isbn13"
				type="text"
				inputMode="numeric"
				dir="ltr"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				autoComplete="off"
				placeholder={labels.placeholder}
			/>
			<div role="status">
				{preview === "loading" ? (
					<p className="muted">{labels.lookingUp}</p>
				) : null}
				{preview === "notIsbn" ? (
					<p className="callout callout-warn">{labels.notIsbn}</p>
				) : null}
				{preview === "missing" ? (
					<p className="callout callout-warn">{labels.notFound}</p>
				) : null}
				{preview && typeof preview === "object" ? (
					<div className="card">
						{preview.coverUrl ? (
							<img alt="" src={preview.coverUrl} />
						) : (
							<span className="thumb" />
						)}
						<div>
							<div className="muted">{labels.found}</div>
							<bdi>
								<strong>{preview.title}</strong>
							</bdi>
							<div className="muted">
								<bdi>{preview.authors.join(", ")}</bdi>
							</div>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
