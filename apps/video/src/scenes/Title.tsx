import { interpolate, useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import {
	Chip,
	Logo,
	Photo,
	Rise,
	Scene,
	Struck,
	progress,
	useShape,
} from "../ui.tsx";

const shelves = [
	{ src: "images/shed.jpg", label: "Dana's shed", focus: [0.45, 0.5] },
	{ src: "images/books.jpg", label: "Sam's shelf", focus: [0.7, 0.4] },
	{ src: "images/camping.jpg", label: "Ada's loft", focus: [0.45, 0.6] },
] as const;

/** "Community Distributed Library turns that street into a lending library…" */
export function Title({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, gutter, stage, title, body } = useShape();
	const noBuilding = cue("No building");
	const noStock = cue("no central stock");
	const stays = cue("everything stays");
	const up = progress(frame, noBuilding - 4, 16);
	const centre = portrait ? 560 : 330;
	const top = interpolate(up, [0, 1], [centre, stage.top + 10]);
	const scale = interpolate(up, [0, 1], [1, portrait ? 0.62 : 0.6]);
	const inner = width - gutter * 2;

	const tileGap = portrait ? 28 : 40;
	const tileWidth = (inner - tileGap * 2) / 3;
	const tileTop = portrait ? 620 : 470;
	const tileHeight = portrait ? 560 : 360;

	return (
		<Scene start={start} end={end}>
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					top,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					transform: `scale(${scale})`,
					transformOrigin: "50% 0",
				}}
			>
				<Rise at={start}>
					<Logo size={portrait ? 150 : 132} />
				</Rise>
				<Rise at={start + 4}>
					<div
						style={{
							marginTop: 24,
							fontSize: title,
							fontWeight: 600,
							letterSpacing: "-0.02em",
							lineHeight: 1.02,
							textAlign: "center",
						}}
					>
						Community{portrait ? <br /> : " "}Distributed
						<br />
						<span style={{ color: palette.accent }}>Library</span>
					</div>
				</Rise>
				<Rise at={cue("lending library")}>
					<div
						style={{
							marginTop: 28,
							fontSize: body * 1.2,
							color: palette.muted,
							opacity: 1 - up,
						}}
					>
						A lending library for your street
					</div>
				</Rise>
			</div>
			<div
				style={{
					position: "absolute",
					left: 0,
					right: 0,
					top: portrait ? 470 : 345,
					display: "flex",
					justifyContent: "center",
					gap: 28,
				}}
			>
				<Rise at={noBuilding}>
					<Struck at={noBuilding + 8} size={body}>
						a building
					</Struck>
				</Rise>
				<Rise at={noStock}>
					<Struck at={noStock + 8} size={body}>
						central stock
					</Struck>
				</Rise>
			</div>
			{shelves.map((shelf, i) => {
				const at = stays + i * 5;
				const t = progress(frame, at, 14);
				const box = {
					x: gutter + i * (tileWidth + tileGap),
					y: tileTop + (1 - t) * 40,
					w: tileWidth,
					h: tileHeight,
				};
				return (
					<div key={shelf.src} style={{ opacity: t }}>
						<Photo
							src={shelf.src}
							box={box}
							from={at}
							to={end}
							focus={[...shelf.focus]}
						/>
						<div
							style={{
								position: "absolute",
								left: box.x + 18,
								top: box.y + box.h - 80,
							}}
						>
							<Chip size={portrait ? 30 : body * 0.9}>{shelf.label}</Chip>
						</div>
					</div>
				);
			})}
		</Scene>
	);
}
