import { Crown, Key, Package } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { mono, palette, radius } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Rise, Scene, useShape } from "../ui.tsx";

const COMMAND = "/open-a-library";

/**
 * "No programming needed. Open the code in Claude Code and type 'open a
 * library'…" The command as typed, and what it does, from the
 * open-a-library skill and docs/self-hosting.md.
 */
export function Code({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, gutter, stage, body } = useShape();
	const typing = cue("type");
	const typed = Math.min(
		COMMAND.length,
		Math.max(0, Math.floor((frame - typing) * 0.9)),
	);
	const caret = typed < COMMAND.length || Math.floor(frame / 15) % 2 === 0;
	const inner = width - gutter * 2;

	const terminal = (
		<Rise at={cue("Open the code")}>
			<div
				style={{
					width: portrait ? inner : 900,
					background: palette.ink,
					color: "#e6ecea",
					borderRadius: radius.box,
					overflow: "hidden",
					fontFamily: mono,
				}}
			>
				<div
					style={{
						padding: "16px 26px",
						fontSize: 26,
						color: "#9ea9a5",
						borderBottom: "2px solid #2b3331",
					}}
				>
					Claude Code · community-distributed-library
				</div>
				<div
					style={{ padding: "34px 30px 44px", fontSize: portrait ? 54 : 64 }}
				>
					<span style={{ color: palette.brand }}>&gt; </span>
					{COMMAND.slice(0, typed)}
					<span style={{ opacity: caret ? 1 : 0 }}>▍</span>
				</div>
			</div>
		</Rise>
	);

	const steps = [
		{
			at: cue("one key"),
			icon: <Key weight="bold" />,
			label: "Checks your one key",
		},
		{
			at: cue("builds the library"),
			icon: <Package weight="bold" />,
			label: "Builds the library",
		},
		{
			at: cue("first admin"),
			icon: <Crown weight="bold" />,
			label: "Makes you its first admin",
		},
	].map((step) => (
		<Rise key={step.label} at={step.at}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 24,
					fontSize: portrait ? 46 : 56,
					fontWeight: 600,
				}}
			>
				<Chip
					tone="solid"
					size={38}
					style={{ width: 80, justifyContent: "center" }}
				>
					{step.icon}
				</Chip>
				{step.label}
			</div>
		</Rise>
	));

	const heading = (
		<Rise at={start}>
			<div
				style={{
					fontSize: portrait ? 76 : 84,
					fontWeight: 600,
					letterSpacing: "-0.02em",
				}}
			>
				No programming needed
			</div>
			<div style={{ fontSize: body, color: palette.muted, marginTop: 10 }}>
				About twenty minutes, start to finish
			</div>
		</Rise>
	);

	if (portrait) {
		return (
			<Scene start={start} end={end}>
				<div
					style={{
						position: "absolute",
						left: gutter,
						right: gutter,
						top: stage.top,
						display: "flex",
						flexDirection: "column",
						gap: 54,
					}}
				>
					{heading}
					{terminal}
					<div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
						{steps}
					</div>
				</div>
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			<div style={{ position: "absolute", left: gutter, top: 110 }}>
				{heading}
			</div>
			<div style={{ position: "absolute", left: gutter, top: 360 }}>
				{terminal}
			</div>
			<div
				style={{
					position: "absolute",
					left: 1080,
					top: 360,
					display: "flex",
					flexDirection: "column",
					gap: 44,
				}}
			>
				{steps}
			</div>
		</Scene>
	);
}
