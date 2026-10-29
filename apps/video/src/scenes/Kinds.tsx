import { Books, Ticket, Toolbox, UserPlus } from "@phosphor-icons/react";
import { useCurrentFrame } from "remotion";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Photo, Rise, Scene, progress, useShape } from "../ui.tsx";

/** "A library lends books or things, and it's invite-only…" */
export function Kinds({ start, end }: { start: number; end: number }) {
	const frame = useCurrentFrame();
	const { portrait, width, height, gutter, stage, body } = useShape();
	const books = cue("books");
	const things = cue("things");
	const invite = cue("invite-only");
	const vouch = cue("members vouch");
	const inviting = progress(frame, invite - 2, 16);
	const inner = width - gutter * 2;
	const full = stage.bottom - stage.top;

	const halves = portrait
		? [
				{ x: gutter, y: stage.top, w: inner, h: full / 2 - 14 },
				{ x: gutter, y: stage.top + full / 2 + 14, w: inner, h: full / 2 - 14 },
			]
		: [
				{ x: gutter, y: stage.top, w: inner / 2 - 20, h: full - 20 },
				{
					x: gutter + inner / 2 + 20,
					y: stage.top,
					w: inner / 2 - 20,
					h: full - 20,
				},
			];
	const kinds = [
		{
			src: "images/books.jpg",
			at: books,
			label: "Books",
			icon: <Books weight="bold" />,
			focus: [0.7, 0.4] as [number, number],
		},
		{
			src: "images/camping.jpg",
			at: things,
			label: "Things",
			icon: <Toolbox weight="bold" />,
			focus: [0.45, 0.6] as [number, number],
		},
	];

	return (
		<Scene start={start} end={end}>
			<div style={{ opacity: 1 - inviting }}>
				{kinds.map((kind, i) => {
					const box = halves[i]!;
					return (
						<div
							key={kind.src}
							style={{ opacity: i ? progress(frame, kind.at - 4, 12) : 1 }}
						>
							<Photo
								src={kind.src}
								box={box}
								from={start}
								to={end}
								focus={kind.focus}
							/>
							<Rise
								at={kind.at}
								style={{
									position: "absolute",
									left: box.x + 28,
									top: box.y + 28,
								}}
							>
								<Chip tone="solid" icon={kind.icon} size={body * 1.15}>
									{kind.label}
								</Chip>
							</Rise>
						</div>
					);
				})}
			</div>
			<div style={{ opacity: inviting }}>
				<Photo
					src="images/invite.jpg"
					box={
						portrait
							? { x: gutter, y: stage.top, w: inner, h: full }
							: { x: 0, y: 0, w: width, h: height }
					}
					from={invite}
					to={end}
					focus={[0.52, 0.45]}
					zoom={[1.02, 1.1]}
					round={portrait}
				/>
				<div
					style={{
						position: "absolute",
						left: gutter + (portrait ? 28 : 0),
						top: portrait ? stage.bottom - 210 : 96,
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-start",
						gap: 18,
					}}
				>
					<Rise at={invite}>
						<Chip
							tone="solid"
							icon={<Ticket weight="bold" />}
							size={body * 1.2}
						>
							Invite-only
						</Chip>
					</Rise>
					<Rise at={vouch}>
						<Chip
							icon={<UserPlus weight="bold" color={palette.accent} />}
							size={body}
						>
							Members vouch for who they bring in
						</Chip>
					</Rise>
				</div>
			</div>
		</Scene>
	);
}
