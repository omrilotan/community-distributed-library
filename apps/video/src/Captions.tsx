import { useCurrentFrame } from "remotion";
import { frameAt, sentences, type Word } from "./timing.ts";
import { palette, radius } from "./theme.ts";
import { useShape } from "./ui.tsx";

type Chunk = { words: Word[]; start: number; end: number };

/**
 * The narration in short pieces, a sentence or part of one at a time. A
 * piece breaks at a comma or colon when it can, so it reads as said.
 */
function chunks(limit: number): Chunk[] {
	const pieces: Word[][] = [];
	for (const { words } of sentences) {
		let piece: Word[] = [];
		let length = 0;
		for (const word of words) {
			if (length + word.w.length > limit && piece.length) {
				pieces.push(piece);
				piece = [];
				length = 0;
			}
			piece.push(word);
			length += word.w.length + 1;
			if (/[,:;]$/.test(word.w) && length > limit * 0.55) {
				pieces.push(piece);
				piece = [];
				length = 0;
			}
		}
		if (piece.length) pieces.push(piece);
	}
	return pieces.map((words, i) => {
		const start = frameAt(words[0]!.s) - 3;
		const next = pieces[i + 1];
		const done = frameAt(words.at(-1)!.e) + 12;
		const end = next ? Math.min(done, frameAt(next[0]!.s) - 3) : done;
		return { words, start, end: Math.max(end, frameAt(words.at(-1)!.e)) };
	});
}

const byLimit = new Map<number, Chunk[]>();

export function Captions() {
	const frame = useCurrentFrame();
	const { width, gutter, captionBottom, captionSize, captionChars, portrait } =
		useShape();
	const all = byLimit.get(captionChars) ?? chunks(captionChars);
	byLimit.set(captionChars, all);
	const chunk = all.find(({ start, end }) => frame >= start && frame < end);
	if (!chunk) return null;
	return (
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: captionBottom,
				display: "flex",
				justifyContent: "center",
				padding: `0 ${gutter}px`,
			}}
		>
			<div
				style={{
					maxWidth: portrait ? width - gutter * 2 : 1500,
					padding: `${captionSize * 0.32}px ${captionSize * 0.6}px`,
					background: `${palette.surface}f2`,
					border: `2px solid ${palette.line}`,
					borderRadius: radius.box,
					fontSize: captionSize,
					fontWeight: 600,
					lineHeight: 1.25,
					textAlign: "center",
					letterSpacing: "-0.01em",
				}}
			>
				{chunk.words.map((word, i) => (
					<span
						key={i}
						style={{
							color:
								frame >= frameAt(word.s) - 2
									? palette.ink
									: `${palette.muted}66`,
						}}
					>
						{i ? " " : ""}
						{word.w}
					</span>
				))}
			</div>
		</div>
	);
}
