import narration from "./words.json" with { type: "json" };
import { FPS, LEAD } from "./theme.ts";

export type Word = { w: string; s: number; e: number };
export type Sentence = { text: string; words: Word[] };

export const sentences: Sentence[] = narration.sentences;
export const words: Word[] = sentences.flatMap((sentence) => sentence.words);
export const narrationMs = narration.durationMs;

const norm = (word: string) => word.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The video frame at which a moment of the narration plays. */
export const frameAt = (ms: number) => Math.round((ms / 1000 + LEAD) * FPS);

/**
 * Where a phrase is said, looking from frame `after` on. A phrase that is
 * not in the script stops the render, so a rewrite cannot leave a scene
 * waiting for words that never come.
 */
function find(phrase: string, after: number): [Word, Word] {
	const target = phrase.split(/\s+/).map(norm);
	for (let i = 0; i <= words.length - target.length; i++) {
		if (frameAt(words[i]!.s) < after) continue;
		if (target.every((t, k) => norm(words[i + k]!.w) === t)) {
			return [words[i]!, words[i + target.length - 1]!];
		}
	}
	throw new Error(`"${phrase}" is not in the narration`);
}

/** The frame a phrase starts being said. */
export const cue = (phrase: string, after = 0) =>
	frameAt(find(phrase, after)[0].s);

/** The frame a phrase has been said by. */
export const cueEnd = (phrase: string, after = 0) =>
	frameAt(find(phrase, after)[1].e);
