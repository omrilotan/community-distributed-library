import { Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { Chip, Phone, Rise, Scene, useShape } from "../ui.tsx";

export type Step = { at: number; label: string; icon: ReactNode };

/**
 * The app on a phone, with the steps being narrated beside it (landscape)
 * or the current one above it (portrait). Each step brings its screen.
 */
export function PhoneSteps({
	start,
	end,
	heading,
	steps,
	screens,
	taps = [],
	overlay,
	aside,
}: {
	start: number;
	end: number;
	heading?: { at: number; text: string };
	steps: Step[];
	screens: { src: string; at: number }[];
	taps?: { at: number; x: number; y: number }[];
	/** Drawn over the phone's screen, in its own coordinates. */
	overlay?: ReactNode;
	/** Beside the steps in landscape, under the phone in portrait. */
	aside?: ReactNode;
}) {
	const frame = useCurrentFrame();
	const { portrait, width, stage, body } = useShape();
	const current = Math.max(
		0,
		steps.findLastIndex((step) => frame >= step.at),
	);
	const phoneHeight = portrait ? 980 : stage.bottom - stage.top + 40;
	const phoneWidth = Math.round(phoneHeight * 0.462);
	const phone = (
		<Phone
			x={portrait ? (width - phoneWidth) / 2 : 330}
			y={portrait ? stage.top + 110 : stage.top - 20}
			height={phoneHeight}
			screens={screens}
			taps={taps}
		>
			{overlay}
		</Phone>
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
							{step.label}
						</Chip>
					</Rise>
				</div>
				{phone}
				{aside}
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
					top: heading ? 150 : 210,
					display: "flex",
					flexDirection: "column",
					gap: 28,
				}}
			>
				{heading ? (
					<Rise at={heading.at}>
						<div
							style={{
								fontSize: 64,
								fontWeight: 600,
								letterSpacing: "-0.02em",
								marginBottom: 14,
							}}
						>
							{heading.text}
						</div>
					</Rise>
				) : null}
				{steps.map((step, i) => (
					<Rise key={step.label} at={step.at}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 26,
								fontSize: 50,
								fontWeight: 600,
								color: i === current ? palette.ink : palette.muted,
							}}
						>
							<Chip
								tone={i === current ? "solid" : "soft"}
								size={38}
								style={{ width: 80, justifyContent: "center" }}
							>
								{i < current ? <Check weight="bold" /> : step.icon}
							</Chip>
							{step.label}
						</div>
					</Rise>
				))}
				{aside}
			</div>
		</Scene>
	);
}
