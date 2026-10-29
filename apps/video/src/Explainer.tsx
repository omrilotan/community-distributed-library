import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import { Captions } from "./Captions.tsx";
import { Assistant } from "./scenes/Assistant.tsx";
import { End, InPerson } from "./scenes/End.tsx";
import { Flow } from "./scenes/Flow.tsx";
import { Handoff } from "./scenes/Handoff.tsx";
import { Kinds } from "./scenes/Kinds.tsx";
import { Street } from "./scenes/Street.tsx";
import { System } from "./scenes/System.tsx";
import { Title } from "./scenes/Title.tsx";
import { FPS, LEAD, TAIL, font, palette, type Shape } from "./theme.ts";
import { cue, frameAt, narrationMs } from "./timing.ts";
import { FADE, ShapeContext } from "./ui.tsx";

export const length = frameAt(narrationMs) + Math.round(TAIL * FPS);

/**
 * Each scene starts as its first words are said and hands over to the next
 * a moment before that one's, so the picture leads the voice a little.
 */
const scenes = [
	{ Scene: Street, at: 0 },
	{ Scene: Title, at: cue("Community Distributed Library turns") },
	{ Scene: Kinds, at: cue("A library lends") },
	{ Scene: Flow, at: cue("Find what you need") },
	{ Scene: Handoff, at: cue("At the door") },
	{ Scene: Assistant, at: cue("Or just ask") },
	{ Scene: System, at: cue("Under the hood") },
	{ Scene: InPerson, at: cue("That only happens") },
	{ Scene: End, at: cue("Each library") },
];

export function Explainer({ shape }: { shape: Shape }) {
	return (
		<ShapeContext.Provider value={shape}>
			<AbsoluteFill
				style={{ background: palette.bg, fontFamily: font, color: palette.ink }}
			>
				{scenes.map(({ Scene, at }, i) => {
					const next = scenes[i + 1]?.at;
					const start = Math.max(0, at - FADE);
					const end = next === undefined ? length + FADE : next - FADE;
					return <Scene key={i} start={start} end={end} />;
				})}
				<Captions />
				<Sequence from={Math.round(LEAD * FPS)}>
					<Html5Audio src={staticFile("voice.mp3")} />
				</Sequence>
			</AbsoluteFill>
		</ShapeContext.Provider>
	);
}
