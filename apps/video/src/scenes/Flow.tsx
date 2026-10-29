import {
	CalendarCheck,
	Check,
	HandWaving,
	MagnifyingGlass,
} from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Phone, Rise, Scene, useShape } from "../ui.tsx";

/** "Find what you need, and ask. Once the owner says yes, you pick a time…" */
export function Flow({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, stage, body } = useShape();
	const ask = cue("and ask");
	const yes = cue("Once the owner");
	const time = cue("you pick a time");
	const steps = [
		{ at: start, label: "Find it", icon: <MagnifyingGlass weight="bold" /> },
		{ at: ask, label: "Ask for it", icon: <HandWaving weight="bold" /> },
		{ at: yes, label: "The owner says yes", icon: <Check weight="bold" /> },
		{ at: time, label: "Pick a time", icon: <CalendarCheck weight="bold" /> },
	];
	const current = Math.max(
		0,
		steps.findLastIndex((step) => frame >= step.at),
	);

	const phoneHeight = portrait ? 980 : stage.bottom - stage.top + 40;
	const phoneWidth = Math.round(phoneHeight * 0.462);
	const phone = (
		<Phone
			x={portrait ? (width - phoneWidth) / 2 : 400}
			y={portrait ? stage.top + 110 : stage.top - 20}
			height={phoneHeight}
			screens={[
				{ src: "screens/browse.jpg", at: start },
				{ src: "screens/ask.jpg", at: ask },
				{ src: "screens/answer.jpg", at: yes },
				{ src: "screens/pick-time.jpg", at: time },
			]}
			taps={[
				{ at: ask - 10, x: 0.26, y: 0.36 },
				{ at: ask + 14, x: 0.5, y: 0.443 },
				{ at: cue("says yes") + 4, x: 0.31, y: 0.338 },
				{ at: cue("suits both"), x: 0.85, y: 0.522 },
			]}
		/>
	);

	if (portrait) {
		const step = steps[current]!;
		return (
			<Scene start={start} end={end}>
				<div
					key={current}
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						top: stage.top,
						display: "flex",
						justifyContent: "center",
					}}
				>
					<Rise at={step.at} distance={16}>
						<Chip tone="solid" icon={step.icon} size={body * 1.1}>
							{`${current + 1}. ${step.label}`}
						</Chip>
					</Rise>
				</div>
				{phone}
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			{phone}
			<div
				style={{
					position: "absolute",
					left: 960,
					top: 210,
					display: "flex",
					flexDirection: "column",
					gap: 30,
				}}
			>
				{steps.map((step, i) => (
					<Rise key={step.label} at={step.at}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 26,
								fontSize: 54,
								fontWeight: 600,
								color: i === current ? palette.ink : palette.muted,
							}}
						>
							<Chip
								tone={i === current ? "solid" : "soft"}
								size={40}
								style={{ width: 84, justifyContent: "center" }}
							>
								{i < current ? <Check weight="bold" /> : step.icon}
							</Chip>
							{step.label}
						</div>
					</Rise>
				))}
			</div>
		</Scene>
	);
}
