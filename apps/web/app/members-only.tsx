"use client";

import { useEffect, useState } from "react";
import { PlainCover } from "./plain-cover.tsx";

interface Book {
	title: string;
	authors: string;
	cover: string;
}

/**
 * What a visitor sees on tapping a book: that borrowing is for members, and
 * that a member's invitation is the way in. A popover the tiles open by
 * themselves, so it works before (or without) script; with script it also
 * shows which book was tapped.
 */
export function MembersOnly({
	labels,
}: {
	labels: {
		title: string;
		body: string;
		signIn: string;
		about: string;
		keepLooking: string;
	};
}) {
	const [book, setBook] = useState<Book | null>(null);

	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			const tile = (event.target as Element | null)?.closest<HTMLElement>(
				"[popovertarget='members-only'][data-title]",
			);
			if (!tile) return;
			setBook({
				title: tile.dataset.title ?? "",
				authors: tile.dataset.authors ?? "",
				cover: tile.dataset.cover ?? "",
			});
		};
		document.addEventListener("click", onClick, true);
		return () => document.removeEventListener("click", onClick, true);
	}, []);

	return (
		<div
			id="members-only"
			popover="auto"
			className="sheet"
			role="dialog"
			aria-labelledby="members-only-title"
		>
			{book ? (
				<div className="sheet-book">
					<span className="sheet-cover">
						{book.cover ? (
							<img alt="" src={book.cover} />
						) : (
							<PlainCover title={book.title} size="thumb" />
						)}
					</span>
					<span>
						<bdi className="sheet-book-title">{book.title}</bdi>
						<bdi className="muted">{book.authors}</bdi>
					</span>
				</div>
			) : null}
			<h2 id="members-only-title">{labels.title}</h2>
			<p className="muted">{labels.body}</p>
			<div className="sheet-actions">
				<a className="btn" href="/login">
					{labels.signIn}
				</a>
				<a className="btn secondary" href="/about">
					{labels.about}
				</a>
				<button
					type="button"
					className="secondary"
					popoverTarget="members-only"
					popoverTargetAction="hide"
				>
					{labels.keepLooking}
				</button>
			</div>
		</div>
	);
}
