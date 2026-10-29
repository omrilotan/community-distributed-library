import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import { Captions } from "./Captions.tsx";
import { Code } from "./scenes/Code.tsx";
import { End } from "./scenes/End.tsx";
import { Moderate } from "./scenes/Moderate.tsx";
import { Open } from "./scenes/Open.tsx";
import { Runs } from "./scenes/Runs.tsx";
import { Setup } from "./scenes/Setup.tsx";
import { Street } from "./scenes/Street.tsx";
import { Title } from "./scenes/Title.tsx";
import { Vouch } from "./scenes/Vouch.tsx";
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
	{ Scene: Open, at: cue("You can open one") },
	{ Scene: Code, at: cue("No programming") },
	{ Scene: Setup, at: cue("Give it a description") },
	{ Scene: Vouch, at: cue("It's invite-only") },
	{ Scene: Runs, at: cue("From there") },
	{ Scene: Moderate, at: cue("Ask a neighbour") },
	{ Scene: End, at: cue("No money") + 8 },
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
