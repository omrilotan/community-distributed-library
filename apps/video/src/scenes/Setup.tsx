import {
	Link,
	Palette,
	TextAlignLeft,
	Translate,
	UserPlus,
} from "@phosphor-icons/react";
import { palette } from "../theme.ts";
import { cue } from "../timing.ts";
import { Chip, Rise, useShape } from "../ui.tsx";
import { PhoneSteps } from "./Steps.tsx";

/**
 * "Give it a description, its languages and a colour. Then invite your first
 * neighbours." Moderation > Settings and > Invites, as the admin sees them.
 */
export function Setup({ start, end }: { start: number; end: number }) {
	const { portrait, gutter, stage, body } = useShape();
	const languages = cue("its languages");
	const colour = cue("a colour");
	const invite = cue("Then invite");
	const created = cue("first neighbours") + 6;
	const ready = (
		<Rise at={created + 8}>
			<Chip
				tone="soft"
				icon={<Link weight="bold" />}
				size={portrait ? body * 0.9 : 36}
				style={{ marginTop: portrait ? 0 : 12 }}
			>
				A link to share with them
			</Chip>
		</Rise>
	);
	return (
		<PhoneSteps
			start={start}
			end={end}
			steps={[
				{
					at: start,
					label: "A description",
					icon: <TextAlignLeft weight="bold" />,
				},
				{
					at: languages,
					label: "Its languages",
					icon: <Translate weight="bold" />,
				},
				{ at: colour, label: "A colour", icon: <Palette weight="bold" /> },
				{
					at: invite,
					label: "Invite neighbours",
					icon: <UserPlus weight="bold" />,
				},
			]}
			screens={[
				{ src: "screens/settings-about.jpg", at: start },
				{ src: "screens/settings-languages.jpg", at: languages },
				{ src: "screens/settings-colour.jpg", at: colour },
				{ src: "screens/invites.jpg", at: invite },
			]}
			taps={[
				{ at: start + 14, x: 0.5, y: 0.83 },
				{ at: languages + 8, x: 0.5, y: 0.171 },
				{ at: colour + 8, x: 0.22, y: 0.267 },
				{ at: created, x: 0.18, y: 0.575 },
			]}
			aside={
				portrait ? (
					<div
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							top: stage.bottom - 70,
							display: "flex",
							justifyContent: "center",
							padding: `0 ${gutter}px`,
							color: palette.ink,
						}}
					>
						{ready}
					</div>
				) : (
					ready
				)
			}
		/>
	);
}
