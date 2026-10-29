import { Browser, Check, PlugsConnected, Sparkle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Img, staticFile, useCurrentFrame } from "remotion";
import { palette, radius } from "../theme.ts";
import { cue, cueEnd } from "../timing.ts";
import { Card, Chip, Mono, Rise, Scene, Tap, useShape } from "../ui.tsx";

function Bubble({
	mine,
	children,
	size,
}: {
	mine?: boolean;
	children: ReactNode;
	size: number;
}) {
	return (
		<div
			style={{
				display: "flex",
				justifyContent: mine ? "flex-end" : "flex-start",
			}}
		>
			<div
				style={{
					maxWidth: "82%",
					padding: `${size * 0.45}px ${size * 0.65}px`,
					borderRadius: radius.box,
					fontSize: size,
					lineHeight: 1.3,
					background: mine ? palette.accent : palette.bg,
					color: mine ? palette.accentInk : palette.ink,
					border: mine ? "none" : `2px solid ${palette.line}`,
				}}
			>
				{children}
			</div>
		</div>
	);
}

const ASK = "Find me a drill for Saturday";

/**
 * "Or just ask your assistant. Every library has its own MCP server, and its
 * pages speak WebMCP…" A conversation drawn here, in the library's look, not
 * any one assistant's.
 */
export function Assistant({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, gutter, stage, body } = useShape();
	const search = cue("can search");
	const arrange = cue("and arrange");
	const yes = cue("with your yes");
	const tapped = cueEnd("yes first") - 2;
	const typed = Math.min(
		ASK.length,
		Math.max(0, Math.floor((frame - start - 4) * 1.6)),
	);
	const size = portrait ? 36 : 38;

	const chat = (
		<Card
			style={{
				position: "absolute",
				...(portrait
					? {
							left: gutter,
							top: stage.top + 250,
							width: width - gutter * 2,
							height: stage.bottom - stage.top - 250,
						}
					: {
							left: gutter,
							top: stage.top,
							width: 980,
							height: stage.bottom - stage.top,
						}),
				padding: 36,
				display: "flex",
				flexDirection: "column",
				gap: 22,
				overflow: "hidden",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 14,
					fontSize: size * 0.85,
					color: palette.muted,
					fontWeight: 600,
				}}
			>
				<Sparkle weight="fill" color={palette.brand} /> Your assistant
			</div>
			<Bubble mine size={size}>
				{ASK.slice(0, typed)}
				{typed < ASK.length ? "▍" : ""}
			</Bubble>
			<Rise at={cue("MCP server")}>
				<Bubble size={size}>Let me look in Neighbourhood Shed.</Bubble>
			</Rise>
			<Rise at={search}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						fontSize: size * 0.8,
						color: palette.muted,
					}}
				>
					<PlugsConnected weight="bold" color={palette.accent} />
					<Mono>search_catalogue("drill")</Mono>
				</div>
			</Rise>
			<Rise at={search + 8}>
				<div
					style={{
						display: "flex",
						gap: 22,
						alignItems: "center",
						padding: 16,
						border: `2px solid ${palette.line}`,
						borderRadius: radius.box,
						background: palette.surface,
					}}
				>
					<Img
						src={staticFile("images/shed.jpg")}
						style={{
							width: size * 3.4,
							height: size * 2.4,
							objectFit: "cover",
							objectPosition: "45% 50%",
							borderRadius: radius.small,
						}}
					/>
					<div>
						<div style={{ fontSize: size, fontWeight: 600 }}>
							Cordless drill
						</div>
						<div
							style={{
								fontSize: size * 0.8,
								color: palette.muted,
								marginTop: 4,
							}}
						>
							Dana · three doors down
						</div>
						<Chip tone="soft" size={size * 0.62} style={{ marginTop: 10 }}>
							available
						</Chip>
					</div>
				</div>
			</Rise>
			<Rise at={arrange}>
				<Bubble size={size}>
					Dana has one. Shall I ask to borrow it for Saturday?
				</Bubble>
			</Rise>
			<Rise at={yes}>
				<div
					style={{
						display: "flex",
						gap: 16,
						alignItems: "center",
						position: "relative",
					}}
				>
					{frame < tapped + 10 ? (
						<>
							<div style={{ position: "relative" }}>
								<Chip tone="solid" size={size * 0.9}>
									Yes, ask Dana
								</Chip>
								<Tap at={tapped} x={0.5} y={0.5} />
							</div>
							<Chip tone="quiet" size={size * 0.9}>
								Not now
							</Chip>
						</>
					) : (
						<Chip tone="soft" icon={<Check weight="bold" />} size={size * 0.9}>
							Asked Dana for the drill
						</Chip>
					)}
				</div>
			</Rise>
		</Card>
	);

	const pills = (
		<>
			<Rise at={cue("MCP server")}>
				<Chip tone="solid" icon={<PlugsConnected weight="bold" />} size={body}>
					MCP server
				</Chip>
			</Rise>
			<Rise at={cue("WebMCP")}>
				<Chip tone="solid" icon={<Browser weight="bold" />} size={body}>
					WebMCP
				</Chip>
			</Rise>
		</>
	);
	const clients = ["Claude", "ChatGPT", "an agent in"].map((name) => (
		<Rise key={name} at={cue(name)}>
			<Chip size={body * 0.9}>
				{name === "an agent in" ? "Your browser's agent" : name}
			</Chip>
		</Rise>
	));

	if (portrait) {
		return (
			<Scene start={start} end={end}>
				<div
					style={{
						position: "absolute",
						left: gutter,
						top: stage.top,
						display: "flex",
						gap: 18,
					}}
				>
					{pills}
				</div>
				<div
					style={{
						position: "absolute",
						left: gutter,
						top: stage.top + 120,
						display: "flex",
						gap: 14,
					}}
				>
					{clients}
				</div>
				{chat}
			</Scene>
		);
	}

	return (
		<Scene start={start} end={end}>
			{chat}
			<div
				style={{
					position: "absolute",
					left: 1170,
					top: 150,
					display: "flex",
					flexDirection: "column",
					gap: 22,
					alignItems: "flex-start",
				}}
			>
				<Rise at={cue("Every library")}>
					<div style={{ fontSize: 46, fontWeight: 600, marginBottom: 6 }}>
						Every library speaks
					</div>
				</Rise>
				{pills}
				<Rise at={cue("Claude")}>
					<div style={{ fontSize: 46, fontWeight: 600, margin: "40px 0 6px" }}>
						to
					</div>
				</Rise>
				{clients}
			</div>
		</Scene>
	);
}
