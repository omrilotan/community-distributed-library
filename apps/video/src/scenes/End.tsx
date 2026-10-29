import { Cloud, Plus, SealCheck, UsersThree } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { palette, radius } from "../theme.ts";
import { cue } from "../timing.ts";
import {
	Card,
	Chip,
	Logo,
	Photo,
	Rise,
	Scene,
	progress,
	useShape,
} from "../ui.tsx";
import { CodeCard } from "./Handoff.tsx";

/** "That only happens in person." */
export function InPerson({ start, end }: { start: number; end: number }) {
	const { portrait, width, height, gutter, stage } = useShape();
	return (
		<Scene start={start} end={end}>
			<Photo
				src="images/handoff.jpg"
				box={
					portrait
						? {
								x: gutter,
								y: stage.top,
								w: width - gutter * 2,
								h: stage.bottom - stage.top,
							}
						: { x: 0, y: 0, w: width, h: height }
				}
				from={start}
				to={end}
				focus={[0.5, 0.45]}
				zoom={[1.1, 1.18]}
				round={portrait}
			/>
			<Rise
				at={start + 6}
				style={{
					position: "absolute",
					...(portrait
						? { left: gutter + 28, top: stage.bottom - 330 }
						: { right: 110, top: 110 }),
				}}
			>
				<CodeCard at={start + 8} size={portrait ? 92 : 84} />
			</Rise>
		</Scene>
	);
}

const libraries = [
	{ name: "Neighbourhood Shed", note: "tools and gear", open: true },
	{ name: "Elm Road Books", note: "books, mostly paperbacks", open: true },
	{ name: "Your street", note: "open one", open: false },
];

/** "Each library is its own deployment… Open one for your street at…" */
export function End({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, height, gutter, stage, body, title } = useShape();
	const publicDomain = cue("public domain");
	const open = cue("Open one");
	const closing = progress(frame, open - 4, 16);
	const inner = width - gutter * 2;
	const tile = portrait
		? { w: inner, h: 220, gap: 28 }
		: { w: (inner - 80) / 3, h: 300, gap: 40 };

	return (
		<Scene start={start} end={end}>
			<div style={{ opacity: 1 - closing }}>
				{libraries.map((library, i) => {
					const x = portrait ? gutter : gutter + i * (tile.w + tile.gap);
					const y = portrait ? stage.top + 40 + i * (tile.h + tile.gap) : 250;
					return (
						<Rise
							key={library.name}
							at={start + i * 5}
							style={{ position: "absolute", left: x, top: y }}
						>
							<Card
								style={{
									width: tile.w,
									height: tile.h,
									padding: 36,
									display: "flex",
									flexDirection: "column",
									justifyContent: "space-between",
									borderStyle: library.open ? "solid" : "dashed",
									borderColor: library.open ? palette.line : palette.lineStrong,
								}}
							>
								<div style={{ display: "flex", alignItems: "center", gap: 20 }}>
									{library.open ? (
										<Logo size={64} />
									) : (
										<div
											style={{
												width: 64,
												height: 64,
												borderRadius: radius.small,
												border: `2px dashed ${palette.lineStrong}`,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												fontSize: 36,
												color: palette.muted,
											}}
										>
											<Plus weight="bold" />
										</div>
									)}
									<div>
										<div style={{ fontSize: body * 1.15, fontWeight: 600 }}>
											{library.name}
										</div>
										<div style={{ fontSize: body * 0.8, color: palette.muted }}>
											{library.note}
										</div>
									</div>
								</div>
								<div style={{ display: "flex", gap: 14 }}>
									<Chip
										tone="soft"
										icon={<UsersThree weight="bold" />}
										size={body * 0.72}
									>
										own members
									</Chip>
									<Chip
										tone="soft"
										icon={<Cloud weight="bold" />}
										size={body * 0.72}
									>
										own deployment
									</Chip>
								</div>
							</Card>
						</Rise>
					);
				})}
				<Rise
					at={publicDomain}
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						top: portrait ? stage.top + 40 + 3 * (tile.h + tile.gap) + 10 : 640,
						display: "flex",
						justifyContent: "center",
					}}
				>
					<Chip
						tone="solid"
						icon={<SealCheck weight="bold" />}
						size={body * 1.15}
					>
						Public domain code
					</Chip>
				</Rise>
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
							Community Distributed{portrait ? <br /> : " "}Library
						</div>
						<div
							style={{
								fontSize: body * 1.1,
								color: palette.muted,
								marginTop: 18,
							}}
						>
							Open one for your street
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
