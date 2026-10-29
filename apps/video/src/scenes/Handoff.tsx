import { Bell, Check } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import {
	Card,
	Chip,
	Logo,
	Mono,
	Photo,
	Rise,
	Scene,
	progress,
	useShape,
} from "../ui.tsx";

/** The code the app shows both people (screens/meet.jpg has the same one). */
export const CODE = "3MXZLY";

/** The handoff code as the loan page shows it, read out at the door. */
export function CodeCard({ at, size }: { at: number; size: number }) {
	const frame = useCurrentFrame();
	return (
		<Card style={{ padding: `${size * 0.5}px ${size * 0.6}px` }}>
			<div
				style={{ fontSize: size * 0.42, color: palette.muted, fontWeight: 500 }}
			>
				Your handoff code
			</div>
			<div style={{ display: "flex", gap: size * 0.12, marginTop: size * 0.2 }}>
				{[...CODE].map((letter, i) => {
					const t = progress(frame, at + i * 3, 8);
					return (
						<Mono
							key={i}
							style={{
								fontSize: size,
								fontWeight: 600,
								color: palette.accent,
								opacity: t,
								transform: `translateY(${(1 - t) * 14}px)`,
								display: "inline-block",
							}}
						>
							{letter}
						</Mono>
					);
				})}
			</div>
			<div
				style={{
					fontSize: size * 0.36,
					color: palette.muted,
					marginTop: size * 0.2,
				}}
			>
				Read it out when you meet
			</div>
		</Card>
	);
}

/** "At the door, a short code confirms the handoff, and the library reminds you…" */
export function Handoff({ start, end }: { start: number; end: number }) {
	const { portrait, width, height, gutter, stage, body } = useShape();
	const code = cue("a short code");
	const confirmed = cue("confirms the handoff");
	const reminds = cue("reminds you");
	const inner = width - gutter * 2;

	const reminder = (
		<Rise at={reminds}>
			<Card
				style={{
					display: "flex",
					gap: 22,
					alignItems: "center",
					padding: "22px 28px",
				}}
			>
				<Logo
					size={portrait ? 64 : 60}
					style={{
						borderRadius: 12,
						background: palette.accentSoft,
						padding: 8,
					}}
				/>
				<div>
					<div
						style={{
							fontSize: body * 0.75,
							color: palette.muted,
							display: "flex",
							gap: 10,
							alignItems: "center",
						}}
					>
						<Bell weight="fill" color={palette.brand} /> Neighbourhood Shed
					</div>
					<div style={{ fontSize: body * 0.95, fontWeight: 600, marginTop: 4 }}>
						The drill is due back on Sunday
					</div>
				</div>
			</Card>
		</Rise>
	);

	if (portrait) {
		return (
			<Scene start={start} end={end}>
				<Photo
					src="images/handoff.jpg"
					box={{ x: gutter, y: stage.top, w: inner, h: 600 }}
					from={start}
					to={end}
					focus={[0.5, 0.5]}
				/>
				<Rise
					at={code}
					style={{
						position: "absolute",
						left: gutter,
						top: stage.top + 630,
						width: inner,
					}}
				>
					<CodeCard at={code + 4} size={104} />
				</Rise>
				<Rise
					at={confirmed}
					style={{
						position: "absolute",
						right: gutter + 30,
						top: stage.top + 655,
					}}
				>
					<Chip tone="solid" icon={<Check weight="bold" />} size={body * 0.9}>
						Handed over
					</Chip>
				</Rise>
				<div
					style={{
						position: "absolute",
						left: gutter,
						top: stage.top + 950,
						width: inner,
					}}
				>
					{reminder}
				</div>
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			<Photo
				src="images/handoff.jpg"
				box={{ x: 0, y: 0, w: 1110, h: height }}
				from={start}
				to={end}
				focus={[0.5, 0.5]}
				round={false}
			/>
			<div
				style={{
					position: "absolute",
					left: 1190,
					top: 110,
					width: 640,
					display: "flex",
					flexDirection: "column",
					gap: 34,
				}}
			>
				<Rise at={code}>
					<CodeCard at={code + 4} size={96} />
				</Rise>
				<Rise at={confirmed}>
					<Chip tone="solid" icon={<Check weight="bold" />} size={body}>
						Handed over
					</Chip>
				</Rise>
				{reminder}
			</div>
		</Scene>
	);
}
