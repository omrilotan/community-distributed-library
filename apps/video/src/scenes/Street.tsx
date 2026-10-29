import { MapPin } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Photo, Rise, Scene, progress, useShape } from "../ui.tsx";

/** "Somewhere on your street, there's a drill… and a neighbour who owns one." */
export function Street({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, height, gutter, stage, body } = useShape();
	const drill = cue("drill");
	const neighbour = cue("a neighbour who");
	const shed = progress(frame, drill, 16);

	if (portrait) {
		const inner = width - gutter * 2;
		const full = stage.bottom - stage.top;
		const streetHeight = full - shed * (full - 640);
		return (
			<Scene start={start} end={end}>
				<Photo
					src="images/street.jpg"
					box={{ x: gutter, y: stage.top, w: inner, h: streetHeight }}
					from={start}
					to={end}
					focus={[0.62, 0.55]}
				/>
				<div
					style={{
						opacity: shed,
						transform: `translateY(${(1 - shed) * 60}px)`,
					}}
				>
					<Photo
						src="images/shed.jpg"
						box={{ x: gutter, y: stage.top + 670, w: inner, h: full - 670 }}
						from={drill}
						to={end}
						focus={[0.5, 0.52]}
					/>
				</div>
				<Rise
					at={neighbour}
					style={{
						position: "absolute",
						left: gutter + 24,
						top: stage.bottom - 96,
					}}
				>
					<Chip
						icon={<MapPin weight="fill" color={palette.brand} />}
						size={body}
					>
						Dana, three doors down
					</Chip>
				</Rise>
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			<Photo
				src="images/street.jpg"
				box={{ x: 0, y: 0, w: width, h: height }}
				from={start}
				to={end}
				focus={[0.6, 0.55]}
				zoom={[1, 1.08]}
				round={false}
			/>
			<div
				style={{
					opacity: shed,
					transform: `translateX(${(1 - shed) * 120}px)`,
				}}
			>
				<Photo
					src="images/shed.jpg"
					box={{ x: 1150, y: 110, w: 660, h: 440 }}
					from={drill}
					to={end}
					focus={[0.5, 0.5]}
					style={{ border: `8px solid ${palette.surface}` }}
				/>
			</div>
			<Rise
				at={neighbour}
				style={{ position: "absolute", left: 1150, top: 590 }}
			>
				<Chip icon={<MapPin weight="fill" color={palette.brand} />} size={body}>
					Dana, three doors down
				</Chip>
			</Rise>
		</Scene>
	);
}
