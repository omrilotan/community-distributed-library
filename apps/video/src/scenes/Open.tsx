import {
	Books,
	Check,
	Cloud,
	Envelope,
	Globe,
	MapPin,
	Toolbox,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { palette, radius } from "../theme.ts";
import { cue } from "../timing.ts";
import { Card, Chip, Mono, Rise, Scene, useShape } from "../ui.tsx";

function Row({
	at,
	label,
	children,
	size,
}: {
	at: number;
	label: string;
	children: ReactNode;
	size: number;
}) {
	return (
		<Rise at={at}>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 10,
					padding: "18px 0",
					borderTop: `2px solid ${palette.line}`,
				}}
			>
				<div
					style={{
						fontSize: size * 0.62,
						color: palette.muted,
						fontWeight: 500,
					}}
				>
					{label}
				</div>
				<div
					style={{
						fontSize: size,
						fontWeight: 600,
						display: "flex",
						alignItems: "center",
						gap: 14,
					}}
				>
					{children}
				</div>
			</div>
		</Rise>
	);
}

/**
 * "You can open one for your community. Pick a name, the middle of your
 * neighbourhood, and whether it lends books or things. It runs on a domain
 * you own…" The choices docs/self-hosting.md asks for, filled in.
 */
export function Open({ start, end }: { start: number; end: number }) {
	const { portrait, width, gutter, stage, body } = useShape();
	const size = portrait ? 44 : 54;
	const inner = width - gutter * 2;

	const choices = (
		<Rise at={cue("Pick a name") - 2}>
			<Card style={{ padding: "8px 40px 16px", width: portrait ? inner : 860 }}>
				<Row at={cue("Pick a name")} label="Name" size={size}>
					Neighbourhood Shed
				</Row>
				<Row
					at={cue("the middle")}
					label="The middle of the neighbourhood"
					size={size}
				>
					<MapPin weight="fill" color={palette.brand} /> Finchley Church End
				</Row>
				<Row at={cue("books or things")} label="It lends" size={size}>
					<Chip tone="quiet" icon={<Books weight="bold" />} size={size * 0.75}>
						Books
					</Chip>
					<Chip
						tone="solid"
						icon={<Toolbox weight="bold" />}
						size={size * 0.75}
					>
						Things
					</Chip>
				</Row>
			</Card>
		</Rise>
	);

	const where = (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 24,
				alignItems: "flex-start",
			}}
		>
			<Rise at={cue("a domain you own")}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 16,
						padding: "20px 30px",
						background: palette.surface,
						border: `2px solid ${palette.lineStrong}`,
						borderRadius: radius.box,
						fontSize: portrait ? 42 : 46,
					}}
				>
					<Globe weight="bold" color={palette.brand} />
					<Mono style={{ fontWeight: 600 }}>our-street.example.org</Mono>
				</div>
			</Rise>
			<Rise at={cue("Cloudflare account")}>
				<Chip icon={<Cloud weight="bold" color={palette.accent} />} size={body}>
					Your own Cloudflare account
				</Chip>
			</Rise>
			<Rise at={cue("five dollars")}>
				<div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
					<div
						style={{
							fontSize: portrait ? 96 : 128,
							fontWeight: 700,
							letterSpacing: "-0.03em",
							color: palette.accent,
						}}
					>
						US$5
					</div>
					<div style={{ fontSize: body * 1.2, fontWeight: 600 }}>a month</div>
				</div>
			</Rise>
			<Rise at={cue("email included")}>
				<Chip tone="soft" icon={<Envelope weight="bold" />} size={body}>
					email included <Check weight="bold" />
				</Chip>
			</Rise>
		</div>
	);

	const heading = (
		<Rise at={start}>
			<div
				style={{
					fontSize: portrait ? 72 : 80,
					fontWeight: 600,
					letterSpacing: "-0.02em",
					lineHeight: 1.05,
				}}
			>
				Open one for your community
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
						gap: 34,
					}}
				>
					{heading}
					{choices}
					{where}
				</div>
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			<div
				style={{ position: "absolute", left: gutter, top: 130, width: 1700 }}
			>
				{heading}
			</div>
			<div style={{ position: "absolute", left: gutter, top: 270 }}>
				{choices}
			</div>
			<div style={{ position: "absolute", left: 1040, top: 280 }}>{where}</div>
		</Scene>
	);
}
