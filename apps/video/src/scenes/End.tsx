import { Database, SealCheck, UsersThree } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import {
	Card,
	Chip,
	Logo,
	Photo,
	Rise,
	Scene,
	Struck,
	progress,
	useShape,
} from "../ui.tsx";

/**
 * "No money changes hands, nothing ships, and nobody sits in between. The
 * members and the data stay yours, and the code is public domain. Start one
 * for your street at community-distributed-library.com."
 */
export function End({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, height, gutter, body, title } = useShape();
	const open = cue("Start one");
	const closing = progress(frame, open - 4, 16);
	const inner = width - gutter * 2;
	const size = portrait ? body * 1.2 : 56;

	const nots = [
		{ at: start + 4, label: "money changing hands" },
		{ at: cue("nothing ships"), label: "shipping" },
		{ at: cue("nobody sits"), label: "anyone in between" },
	];
	const yours = [
		{
			at: cue("The members"),
			icon: <UsersThree weight="bold" />,
			label: "Your members",
		},
		{
			at: cue("the data"),
			icon: <Database weight="bold" />,
			label: "Your data",
		},
		{
			at: cue("public domain"),
			icon: <SealCheck weight="bold" />,
			label: "Public domain code",
		},
	];

	return (
		<Scene start={start} end={end}>
			<div
				style={{
					opacity: 1 - closing,
					position: "absolute",
					inset: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: portrait ? "flex-start" : "center",
					paddingTop: portrait ? 260 : 0,
					paddingBottom: portrait ? 0 : 140,
					gap: portrait ? 90 : 80,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: portrait ? "column" : "row",
						gap: 24,
						alignItems: "center",
					}}
				>
					{nots.map((not) => (
						<Rise key={not.label} at={not.at}>
							<Struck at={not.at + 8} size={size}>
								{not.label}
							</Struck>
						</Rise>
					))}
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: portrait ? "column" : "row",
						gap: 24,
						alignItems: "center",
					}}
				>
					{yours.map((item) => (
						<Rise key={item.label} at={item.at}>
							<Chip tone="solid" icon={item.icon} size={size * 1.1}>
								{item.label}
							</Chip>
						</Rise>
					))}
				</div>
			</div>
			<div style={{ opacity: closing }}>
				<Photo
					src="images/bench.jpg"
					box={{ x: 0, y: 0, w: width, h: height }}
					from={open}
					to={end}
					focus={[0.55, 0.6]}
					zoom={[1.04, 1.1]}
					round={false}
				/>
				<div
					style={{
						position: "absolute",
						inset: 0,
						background: `${palette.ink}33`,
					}}
				/>
				<div
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						top: portrait ? 420 : 0,
						bottom: portrait ? undefined : 120,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Card
						style={{
							padding: portrait ? "64px 56px" : "60px 84px",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							textAlign: "center",
							width: portrait ? inner : undefined,
						}}
					>
						<Logo size={portrait ? 120 : 110} />
						<div
							style={{
								fontSize: title * 0.72,
								fontWeight: 600,
								letterSpacing: "-0.02em",
								marginTop: 22,
								lineHeight: 1.05,
							}}
						>
							Start one for your street
						</div>
						<div
							style={{
								fontSize: body * 1.1,
								color: palette.muted,
								marginTop: 18,
							}}
						>
							Community Distributed Library
						</div>
						<div
							style={{
								fontSize: portrait ? 40 : body * 1.25,
								fontWeight: 600,
								color: palette.accent,
								marginTop: 22,
							}}
						>
							community-distributed-library.com
						</div>
					</Card>
				</div>
			</div>
		</Scene>
	);
}
