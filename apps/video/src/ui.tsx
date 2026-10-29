import {
	createContext,
	useContext,
	type CSSProperties,
	type ReactNode,
} from "react";
import {
	AbsoluteFill,
	Easing,
	Img,
	interpolate,
	staticFile,
	useCurrentFrame,
} from "remotion";
import { font, frames, mono, palette, radius, type Shape } from "./theme.ts";

export const ShapeContext = createContext<Shape>("landscape");

/** The shape being drawn, and where things go in it. */
export function useShape() {
	const shape = useContext(ShapeContext);
	return { shape, portrait: shape === "portrait", ...frames[shape] };
}

const settle = Easing.bezier(0.22, 1, 0.36, 1);

/** 0 before `at`, 1 once `length` frames have passed, eased in between. */
export function progress(frame: number, at: number, length = 12) {
	return interpolate(frame, [at, at + length], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
		easing: settle,
	});
}

/** A scene's time on screen: it fades in at `start` and out at `end`. */
export function Scene({
	start,
	end,
	children,
	background = palette.bg,
}: {
	start: number;
	end: number;
	children: ReactNode;
	background?: string;
}) {
	const frame = useCurrentFrame();
	if (frame < start - 1 || frame > end + FADE) return null;
	const opacity =
		progress(frame, start, FADE) * (1 - progress(frame, end, FADE));
	return (
		<AbsoluteFill
			style={{ background, opacity, fontFamily: font, color: palette.ink }}
		>
			{children}
		</AbsoluteFill>
	);
}
export const FADE = 9;

/** Comes up from a little below and fades in, from frame `at`. */
export function Rise({
	at,
	children,
	distance = 28,
	style,
}: {
	at: number;
	children: ReactNode;
	distance?: number;
	style?: CSSProperties;
}) {
	const frame = useCurrentFrame();
	const t = progress(frame, at, 14);
	return (
		<div
			style={{
				...style,
				opacity: t,
				transform: `translateY(${(1 - t) * distance}px)`,
			}}
		>
			{children}
		</div>
	);
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * A photograph filling a box, drifting slowly toward `focus` between
 * `from` and `to` so a still never sits still.
 */
export function Photo({
	src,
	box,
	from,
	to,
	focus = [0.5, 0.5],
	zoom = [1.04, 1.12],
	round = true,
	style,
}: {
	src: string;
	box: Box;
	from: number;
	to: number;
	focus?: [number, number];
	zoom?: [number, number];
	round?: boolean;
	style?: CSSProperties;
}) {
	const frame = useCurrentFrame();
	const scale = interpolate(frame, [from, to], zoom, {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});
	return (
		<div
			style={{
				position: "absolute",
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				overflow: "hidden",
				borderRadius: round ? radius.box : 0,
				...style,
			}}
		>
			<Img
				src={staticFile(src)}
				style={{
					width: "100%",
					height: "100%",
					objectFit: "cover",
					objectPosition: `${focus[0] * 100}% ${focus[1] * 100}%`,
					transform: `scale(${scale})`,
					transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`,
				}}
			/>
		</div>
	);
}

/** The app's own screens, at the size a phone shows them. */
export const SCREEN = { width: 1082, height: 2426 } as const;

/** A tap: a ring that spreads and fades where a finger lands. */
export function Tap({ at, x, y }: { at: number; x: number; y: number }) {
	const frame = useCurrentFrame();
	if (frame < at || frame > at + 22) return null;
	const t = progress(frame, at, 20);
	return (
		<div
			style={{
				position: "absolute",
				left: `${x * 100}%`,
				top: `${y * 100}%`,
				width: 84,
				height: 84,
				marginLeft: -42,
				marginTop: -42,
				borderRadius: "50%",
				background: `${palette.brand}55`,
				border: `4px solid ${palette.brand}`,
				transform: `scale(${0.5 + t})`,
				opacity: 1 - t,
			}}
		/>
	);
}

/**
 * A phone showing one of the app's screens at a time: each screen slides in
 * over the last at its frame. `taps` are where a finger lands, as fractions
 * of the screen.
 */
export function Phone({
	screens,
	x,
	y,
	height,
	taps = [],
	children,
}: {
	screens: { src: string; at: number }[];
	x: number;
	y: number;
	height: number;
	taps?: { at: number; x: number; y: number }[];
	children?: ReactNode;
}) {
	const frame = useCurrentFrame();
	const bezel = Math.round(height * 0.018);
	const inner = height - bezel * 2;
	const width = Math.round((inner * SCREEN.width) / SCREEN.height) + bezel * 2;
	return (
		<div
			style={{
				position: "absolute",
				left: x,
				top: y,
				width,
				height,
				borderRadius: bezel * 3.4,
				background: palette.ink,
				padding: bezel,
			}}
		>
			<div
				style={{
					position: "relative",
					width: "100%",
					height: "100%",
					borderRadius: bezel * 2.4,
					overflow: "hidden",
					background: palette.surface,
				}}
			>
				{screens.map(({ src, at }, i) => {
					const t = i === 0 ? 1 : progress(frame, at, 12);
					if (t === 0) return null;
					return (
						<Img
							key={src}
							src={staticFile(src)}
							style={{
								position: "absolute",
								inset: 0,
								width: "100%",
								height: "100%",
								transform: `translateX(${(1 - t) * 100}%)`,
							}}
						/>
					);
				})}
				{taps.map((tap) => (
					<Tap key={tap.at} {...tap} />
				))}
				{children}
			</div>
		</div>
	);
}

/** A short label: a tag, a step, a name. */
export function Chip({
	children,
	icon,
	tone = "plain",
	size = 34,
	style,
}: {
	children: ReactNode;
	icon?: ReactNode;
	tone?: "plain" | "soft" | "solid" | "quiet";
	size?: number;
	style?: CSSProperties;
}) {
	const tones = {
		plain: {
			background: palette.surface,
			color: palette.ink,
			border: palette.line,
		},
		soft: {
			background: palette.accentSoft,
			color: palette.accent,
			border: palette.accentSoft,
		},
		solid: {
			background: palette.accent,
			color: palette.accentInk,
			border: palette.accent,
		},
		quiet: {
			background: "transparent",
			color: palette.muted,
			border: palette.lineStrong,
		},
	}[tone];
	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: size * 0.4,
				padding: `${size * 0.32}px ${size * 0.6}px`,
				borderRadius: radius.small,
				fontSize: size,
				fontWeight: 600,
				lineHeight: 1.1,
				whiteSpace: "nowrap",
				background: tones.background,
				color: tones.color,
				border: `2px solid ${tones.border}`,
				...style,
			}}
		>
			{icon}
			{children}
		</div>
	);
}

/** A line drawn through a label, left to right, from frame `at`. */
export function Struck({
	at,
	children,
	size,
}: {
	at: number;
	children: ReactNode;
	size: number;
}) {
	const frame = useCurrentFrame();
	const t = progress(frame, at, 10);
	return (
		<div style={{ position: "relative", display: "inline-block" }}>
			<Chip tone="quiet" size={size}>
				{children}
			</Chip>
			<div
				style={{
					position: "absolute",
					left: "6%",
					top: "50%",
					height: 4,
					width: `${t * 88}%`,
					background: palette.warn,
					borderRadius: 2,
				}}
			/>
		</div>
	);
}

/** The library's mark, from packages/design/logo.svg. */
export function Logo({ size, style }: { size: number; style?: CSSProperties }) {
	return (
		<Img
			src={staticFile("logo.svg")}
			style={{ width: size, height: size, ...style }}
		/>
	);
}

/** A card on the page: surface, hairline, softened corners. */
export function Card({
	children,
	style,
}: {
	children: ReactNode;
	style?: CSSProperties;
}) {
	return (
		<div
			style={{
				background: palette.surface,
				border: `2px solid ${palette.line}`,
				borderRadius: radius.box,
				...style,
			}}
		>
			{children}
		</div>
	);
}

export const Mono = ({
	children,
	style,
}: {
	children: ReactNode;
	style?: CSSProperties;
}) => <span style={{ fontFamily: mono, ...style }}>{children}</span>;
