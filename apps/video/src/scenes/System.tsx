import {
	Bell,
	Browser,
	ChatsCircle,
	Database,
	Handshake,
	LockSimple,
	Sparkle,
	Terminal,
	WebhooksLogo,
	X,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { palette, radius } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Mono, Rise, Scene, progress, useShape } from "../ui.tsx";
import type { Box } from "../ui.tsx";

type Node = {
	box: Box;
	at: number;
	icon: ReactNode;
	name: string;
	note: string;
	strong?: boolean;
};

function Block({ node, dim, size }: { node: Node; dim: number; size: number }) {
	const frame = useCurrentFrame();
	const t = progress(frame, node.at, 12);
	const { box, strong } = node;
	return (
		<div
			style={{
				position: "absolute",
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				display: "flex",
				alignItems: "center",
				gap: size * 0.5,
				padding: `0 ${size * 0.7}px`,
				borderRadius: radius.box,
				background: strong ? palette.accent : palette.surface,
				color: strong ? palette.accentInk : palette.ink,
				border: `2px solid ${strong ? palette.accent : palette.lineStrong}`,
				opacity: t * (1 - dim * 0.65),
				transform: `scale(${0.92 + t * 0.08})`,
			}}
		>
			<div
				style={{
					fontSize: size * 1.3,
					display: "flex",
					color: strong ? palette.accentInk : palette.brand,
				}}
			>
				{node.icon}
			</div>
			<div>
				<div style={{ fontSize: size, fontWeight: 600 }}>{node.name}</div>
				<div style={{ fontSize: size * 0.68, opacity: 0.8, marginTop: 2 }}>
					{node.note}
				</div>
			</div>
		</div>
	);
}

/** A line from one point to another, drawn from frame `at`, with a dot running along it. */
function Wire({
	from,
	to,
	at,
	dim,
	stop = 1,
	dashed,
}: {
	from: [number, number];
	to: [number, number];
	at: number;
	dim: number;
	stop?: number;
	dashed?: boolean;
}) {
	const frame = useCurrentFrame();
	const drawn = progress(frame, at, 14) * stop;
	const [x1, y1] = from;
	const [x2, y2] = to;
	const x = x1 + (x2 - x1) * drawn;
	const y = y1 + (y2 - y1) * drawn;
	if (drawn <= 0) return null;
	const lap = ((frame - at) % 36) / 36;
	const running = drawn >= stop && stop === 1 && !dashed;
	return (
		<g opacity={1 - dim * 0.65}>
			<line
				x1={x1}
				y1={y1}
				x2={x}
				y2={y}
				stroke={dashed ? palette.warn : palette.accent}
				strokeWidth={4}
				strokeDasharray={dashed ? "14 12" : undefined}
				strokeLinecap="round"
			/>
			{running ? (
				<circle
					cx={x1 + (x2 - x1) * lap}
					cy={y1 + (y2 - y1) * lap}
					r={8}
					fill={palette.brand}
				/>
			) : null}
		</g>
	);
}

const left = (box: Box): [number, number] => [box.x, box.y + box.h / 2];
const right = (box: Box): [number, number] => [
	box.x + box.w,
	box.y + box.h / 2,
];
const top = (box: Box): [number, number] => [box.x + box.w / 2, box.y];
const bottom = (box: Box): [number, number] => [
	box.x + box.w / 2,
	box.y + box.h,
];

/**
 * "Under the hood, it's one API… But no tool can confirm a handoff." Every
 * door into the library goes through core; the handoff is the one thing no
 * tool can do.
 */
export function System({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, height, gutter, stage } = useShape();
	const noTool = cue("But no tool");
	// The wire to the handoff starts as soon as it is mentioned and stops
	// short, so the cross is up for as long as the line is being said.
	const blocked = noTool + 10;
	const dim = progress(frame, noTool, 14);
	const size = portrait ? 34 : 38;

	const third = (width - gutter * 2 - 40) / 3;
	const boxes = portrait
		? {
				web: { x: gutter, y: 400, w: third, h: 150 },
				assistant: { x: gutter + third + 20, y: 400, w: third, h: 150 },
				script: { x: gutter + (third + 20) * 2, y: 400, w: third, h: 150 },
				core: { x: width / 2 - 260, y: 640, w: 520, h: 160 },
				notify: { x: gutter, y: 890, w: third, h: 150 },
				convo: { x: gutter + third + 20, y: 890, w: third, h: 150 },
				hooks: { x: gutter + (third + 20) * 2, y: 890, w: third, h: 150 },
				handoff: { x: width / 2 - 260, y: 1090, w: 520, h: 130 },
			}
		: {
				web: { x: 110, y: 230, w: 420, h: 130 },
				assistant: { x: 110, y: 410, w: 420, h: 130 },
				script: { x: 110, y: 590, w: 420, h: 130 },
				core: { x: 760, y: 380, w: 400, h: 180 },
				notify: { x: 1390, y: 230, w: 440, h: 130 },
				convo: { x: 1390, y: 410, w: 440, h: 130 },
				hooks: { x: 1390, y: 590, w: 440, h: 130 },
				handoff: { x: 760, y: 790, w: 400, h: 120 },
			};

	const clients: Node[] = [
		{
			box: boxes.web,
			at: cue("web app"),
			icon: <Browser weight="bold" />,
			name: "Web app",
			note: "the library's pages",
		},
		{
			box: boxes.assistant,
			at: cue("assistant", cue("web app")),
			icon: <Sparkle weight="bold" />,
			name: "Assistant",
			note: "MCP, WebMCP",
		},
		{
			box: boxes.script,
			at: cue("any script"),
			icon: <Terminal weight="bold" />,
			name: "Any script",
			note: "a token and HTTP",
		},
	];
	const core: Node = {
		box: boxes.core,
		at: cue("one API"),
		icon: <Database weight="bold" />,
		name: "Core",
		note: "the /v1 API",
		strong: true,
	};
	const services: Node[] = [
		{
			box: boxes.notify,
			at: cue("Notify"),
			icon: <Bell weight="bold" />,
			name: "Notify",
			note: "email and push",
		},
		{
			box: boxes.convo,
			at: cue("convo"),
			icon: <ChatsCircle weight="bold" />,
			name: "Convo",
			note: "loan messages",
		},
		{
			box: boxes.hooks,
			at: cue("webhooks"),
			icon: <WebhooksLogo weight="bold" />,
			name: "Webhooks",
			note: "everything else",
		},
	];
	const handoff: Node = {
		box: boxes.handoff,
		at: noTool + 2,
		icon: <Handshake weight="bold" />,
		name: "The handoff",
		note: "in person, with the code",
	};
	const callAt = cue("all call");
	const crossAt = blocked + 8;
	const cross = progress(frame, crossAt, 10);

	const wires: {
		from: [number, number];
		to: [number, number];
		at: number;
		gone?: number;
	}[] = portrait
		? [
				...clients.map((node) => ({
					from: bottom(node.box),
					to: top(core.box),
					at: callAt,
				})),
				...services.map((node) => ({
					from: bottom(core.box),
					to: top(node.box),
					at: node.at - 4,
					gone: dim,
				})),
			]
		: [
				...clients.map((node) => ({
					from: right(node.box),
					to: left(core.box),
					at: callAt,
				})),
				...services.map((node) => ({
					from: right(core.box),
					to: left(node.box),
					at: node.at - 4,
				})),
			];
	const block = { from: bottom(core.box), to: top(handoff.box) };
	const crossAtPoint: [number, number] = [
		block.from[0] + (block.to[0] - block.from[0]) * 0.55,
		block.from[1] + (block.to[1] - block.from[1]) * 0.55,
	];

	return (
		<Scene start={start} end={end}>
			<Rise
				at={start}
				style={{
					position: "absolute",
					left: gutter,
					top: portrait ? stage.top : 70,
					display: "flex",
					alignItems: "center",
					gap: 24,
					opacity: 1 - dim * 0.65,
				}}
			>
				<div
					style={{
						fontSize: portrait ? 76 : 70,
						fontWeight: 600,
						letterSpacing: "-0.02em",
					}}
				>
					One API
				</div>
				<Chip tone="soft" size={portrait ? 40 : 38}>
					<Mono>/v1</Mono>
				</Chip>
			</Rise>
			<svg
				width={width}
				height={height}
				style={{ position: "absolute", inset: 0 }}
			>
				{wires.map(({ gone = 0, ...wire }, i) => (
					<g key={i} opacity={1 - gone}>
						<Wire {...wire} dim={dim} />
					</g>
				))}
				{frame >= blocked ? (
					<Wire
						from={block.from}
						to={block.to}
						at={blocked}
						dim={0}
						stop={0.55}
						dashed
					/>
				) : null}
			</svg>
			{[...clients, core].map((node) => (
				<Block key={node.name} node={node} dim={dim} size={size} />
			))}
			{/* In portrait the wire to the handoff runs where these are, so they make way. */}
			<div style={{ opacity: portrait ? 1 - dim : 1 }}>
				{services.map((node) => (
					<Block key={node.name} node={node} dim={dim} size={size} />
				))}
			</div>
			{frame >= handoff.at ? (
				<Block node={handoff} dim={0} size={size} />
			) : null}
			{cross > 0 ? (
				<div
					style={{
						position: "absolute",
						left: crossAtPoint[0] - 34,
						top: crossAtPoint[1] - 34,
						width: 68,
						height: 68,
						borderRadius: "50%",
						background: palette.warn,
						color: palette.accentInk,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						fontSize: 40,
						transform: `scale(${interpolate(cross, [0, 1], [0.4, 1])})`,
						opacity: cross,
					}}
				>
					<X weight="bold" />
				</div>
			) : null}
			{cross > 0 ? (
				<div
					style={{
						position: "absolute",
						left: crossAtPoint[0] + 56,
						top: crossAtPoint[1] - 30,
						opacity: cross,
					}}
				>
					<Chip
						tone="quiet"
						icon={<LockSimple weight="bold" />}
						size={portrait ? 30 : 32}
						style={{
							color: palette.warn,
							borderColor: palette.warn,
							background: palette.warnSoft,
						}}
					>
						no tool for this
					</Chip>
				</div>
			) : null}
		</Scene>
	);
}
