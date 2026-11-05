import { Ticket, UserPlus } from "@phosphor-icons/react";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Photo, Rise, Scene, useShape } from "../ui.tsx";

/** "It's invite-only, so everyone who joins is vouched for by someone already in." */
export function Vouch({ start, end }: { start: number; end: number }) {
	const { portrait, width, height, gutter, stage, body } = useShape();
	return (
		<Scene start={start} end={end}>
			<Photo
				src="images/invite.jpg"
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
				<Rise at={start + 6}>
					<Chip tone="solid" icon={<Ticket weight="bold" />} size={body * 1.2}>
						Invite-only
					</Chip>
				</Rise>
				<Rise at={cue("vouched")}>
					<Chip
						icon={<UserPlus weight="bold" color={palette.accent} />}
						size={body}
					>
						Vouched for by someone already in
					</Chip>
				</Rise>
			</div>
		</Scene>
	);
}
