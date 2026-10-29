import { Composition } from "remotion";
import { Explainer, length } from "./Explainer.tsx";
import { FPS, frames } from "./theme.ts";

/** One video, in the two shapes it is shown in. */
export function Root() {
	return (
		<>
			{(["landscape", "portrait"] as const).map((shape) => (
				<Composition
					key={shape}
					id={`explainer-${shape}`}
					component={Explainer}
					defaultProps={{ shape }}
					width={frames[shape].width}
					height={frames[shape].height}
					fps={FPS}
					durationInFrames={length}
				/>
			))}
		</>
	);
}
