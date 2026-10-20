/**
 * The cover a book gets when nobody has photographed it: its title, set on
 * one of six earthy papers. Most of this community's books are Hebrew
 * originals no provider knows, so this is not an edge case — it is half the
 * shelf, and a grey rectangle there made the library look empty.
 *
 * The paper is chosen from the title, so a book keeps its colour everywhere
 * it appears. Hidden from assistive technology: the title is always written
 * out next to it.
 */
export function PlainCover({
	title,
	authors,
	size = "tile",
	paper,
}: {
	title: string;
	authors?: string[];
	size?: "tile" | "book" | "thumb";
	/** A fixed paper, where covers are set side by side on purpose. */
	paper?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
	return (
		<span
			className={`plain-cover plain-cover-${size}`}
			style={
				{
					"--paper": `var(--paper-${paper ?? paperFor(title)})`,
				} as React.CSSProperties
			}
			aria-hidden="true"
		>
			{size === "thumb" ? null : (
				<>
					<span className="plain-cover-title" dir="auto">
						{title}
					</span>
					{authors?.length ? (
						<span className="plain-cover-author" dir="auto">
							{authors.join(", ")}
						</span>
					) : null}
				</>
			)}
		</span>
	);
}

/** 1–6, stable for a title. */
function paperFor(title: string): number {
	let hash = 0;
	for (const char of title) hash = (hash * 31 + char.codePointAt(0)!) | 0;
	return (Math.abs(hash) % 6) + 1;
}
