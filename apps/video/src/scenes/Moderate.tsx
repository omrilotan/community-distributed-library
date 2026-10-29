import { Clock, Copy, Flag, Tag } from "@phosphor-icons/react";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Phone, Rise, Scene, useShape } from "../ui.tsx";

/** "Ask a neighbour or two to moderate: tags, duplicates, reports. About an hour a week." */
export function Moderate({ start, end }: { start: number; end: number }) {
	const { portrait, width, gutter, stage, body } = useShape();
	const jobs = [
		{ at: cue("tags"), icon: <Tag weight="bold" />, label: "Tags" },
		{
			at: cue("duplicates"),
			icon: <Copy weight="bold" />,
			label: "Duplicates",
		},
		{ at: cue("reports"), icon: <Flag weight="bold" />, label: "Reports" },
	].map((job) => (
		<Rise key={job.label} at={job.at}>
			<Chip tone="soft" icon={job.icon} size={portrait ? body : 44}>
				{job.label}
			</Chip>
		</Rise>
	));
	const hour = (
		<Rise at={cue("About an hour") - 10}>
			<Chip
				tone="solid"
				icon={<Clock weight="bold" />}
				size={portrait ? body * 1.15 : 50}
			>
				About an hour a week
			</Chip>
		</Rise>
	);
	const heading = (
		<Rise at={start}>
			<div
				style={{
					fontSize: portrait ? 60 : 64,
					fontWeight: 600,
					letterSpacing: "-0.02em",
					lineHeight: 1.08,
				}}
			>
				A neighbour or two
				<br />
				<span style={{ color: palette.muted }}>to moderate</span>
			</div>
		</Rise>
	);
	const phoneHeight = portrait ? 760 : stage.bottom - stage.top + 40;
	const phoneWidth = Math.round(phoneHeight * 0.462);
	const phone = (
		<Phone
			x={portrait ? (width - phoneWidth) / 2 : 330}
			y={portrait ? stage.top + 330 : stage.top - 20}
			height={phoneHeight}
			screens={[{ src: "screens/members.jpg", at: start }]}
		/>
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
					}}
				>
					{heading}
				</div>
				<div
					style={{
						position: "absolute",
						left: gutter,
						right: gutter,
						top: stage.top + 180,
						display: "flex",
						gap: 16,
					}}
				>
					{jobs}
				</div>
				{phone}
				<div
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						top: stage.bottom - 90,
						display: "flex",
						justifyContent: "center",
					}}
				>
					{hour}
				</div>
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			{phone}
			<div
				style={{
					position: "absolute",
					left: 880,
					top: 170,
					display: "flex",
					flexDirection: "column",
					gap: 34,
					alignItems: "flex-start",
				}}
			>
				{heading}
				<div style={{ display: "flex", gap: 18 }}>{jobs}</div>
				<div style={{ marginTop: 26 }}>{hour}</div>
			</div>
		</Scene>
	);
}
