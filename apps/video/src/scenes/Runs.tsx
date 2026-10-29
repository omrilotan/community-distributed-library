import {
	Bell,
	CalendarCheck,
	Handshake,
	MagnifyingGlass,
} from "@phosphor-icons/react";
import { palette, radius } from "../theme.ts";
import { cue } from "../timing.ts";
import { Card, Logo, Rise, progress, useShape } from "../ui.tsx";
import { useCurrentFrame } from "remotion";
import { PhoneSteps } from "./Steps.tsx";

/** A ring around the handoff code on the loan page (screens/meet.jpg). */
function CodeRing({ at }: { at: number }) {
	const frame = useCurrentFrame();
	const t = progress(frame, at, 10);
	return (
		<div
			style={{
				position: "absolute",
				left: "5%",
				top: "63.4%",
				width: "88%",
				height: "6%",
				border: `5px solid ${palette.brand}`,
				borderRadius: radius.small,
				opacity: t,
				transform: `scale(${1.08 - t * 0.08})`,
			}}
		/>
	);
}

/**
 * "From there, the library runs itself. Members lend from their own shelves,
 * agree a time, and confirm each handoff at the door with a short code.
 * Reminders chase late returns…"
 */
export function Runs({ start, end }: { start: number; end: number }) {
	const { portrait, gutter, stage, body } = useShape();
	const lend = cue("Members lend");
	const time = cue("agree a time");
	const handoff = cue("confirm each handoff");
	const reminders = cue("Reminders");
	const reminder = (
		<Rise at={reminders}>
			<Card
				style={{
					display: "flex",
					gap: 22,
					alignItems: "center",
					padding: "20px 26px",
					marginTop: portrait ? 0 : 18,
				}}
			>
				<Logo
					size={56}
					style={{
						borderRadius: 12,
						background: palette.accentSoft,
						padding: 8,
					}}
				/>
				<div>
					<div
						style={{
							fontSize: body * 0.72,
							color: palette.muted,
							display: "flex",
							gap: 10,
							alignItems: "center",
						}}
					>
						<Bell weight="fill" color={palette.brand} /> Neighbourhood Shed
					</div>
					<div style={{ fontSize: body * 0.9, fontWeight: 600, marginTop: 4 }}>
						The badminton set is due back on Sunday
					</div>
				</div>
			</Card>
		</Rise>
	);
	return (
		<PhoneSteps
			start={start}
			end={end}
			heading={{ at: start, text: "It runs itself" }}
			steps={[
				{
					at: lend,
					label: "Members lend",
					icon: <MagnifyingGlass weight="bold" />,
				},
				{
					at: time,
					label: "Agree a time",
					icon: <CalendarCheck weight="bold" />,
				},
				{
					at: handoff,
					label: "Hand over with a code",
					icon: <Handshake weight="bold" />,
				},
				{
					at: reminders,
					label: "Reminders chase returns",
					icon: <Bell weight="bold" />,
				},
			]}
			screens={[
				{ src: "screens/admin.jpg", at: start },
				{ src: "screens/browse.jpg", at: lend },
				{ src: "screens/pick-time.jpg", at: time },
				{ src: "screens/meet.jpg", at: handoff },
			]}
			taps={[
				{ at: lend + 12, x: 0.26, y: 0.36 },
				{ at: time + 10, x: 0.85, y: 0.522 },
			]}
			overlay={<CodeRing at={cue("short code")} />}
			aside={
				portrait ? (
					<div
						style={{
							position: "absolute",
							left: gutter,
							right: gutter,
							top: stage.bottom - 150,
						}}
					>
						{reminder}
					</div>
				) : (
					reminder
				)
			}
		/>
	);
}
