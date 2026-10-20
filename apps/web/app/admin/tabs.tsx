import { traits } from "@cdl/contracts";
import { libraryType } from "../../lib/library-type.ts";
import { ArrowsLeftRight } from "@phosphor-icons/react/dist/ssr/ArrowsLeftRight";
import { Books } from "@phosphor-icons/react/dist/ssr/Books";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { Copy } from "@phosphor-icons/react/dist/ssr/Copy";
import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr/EnvelopeSimple";
import { GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { Lightbulb } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { UserPlus } from "@phosphor-icons/react/dist/ssr/UserPlus";
import { Users } from "@phosphor-icons/react/dist/ssr/Users";
import type { Strings } from "../../lib/i18n.ts";

/** Each section's picture, beside its name on a phone. */
const ICONS = {
	overview: SquaresFour,
	log: ClockCounterClockwise,
	settings: GearSix,
	members: Users,
	invites: UserPlus,
	messages: EnvelopeSimple,
	// The shelf's own picture, as the tab bar has it.
	assets: Books,
	loans: ArrowsLeftRight,
	tagging: Tag,
	tags: Lightbulb,
	duplicates: Copy,
} as const;

type Tab = keyof typeof ICONS;

/**
 * Moderator area navigation. `current` is the tab being rendered.
 *
 * Eleven tabs don't fit a phone, and a strip that scrolls sideways hides most
 * of them. So on a phone it is one box, "where you are", that opens into the
 * sections in three groups, each a pair of columns of named pictures: the
 * library, people, books. From a tablet up the same list lays out as the
 * familiar row of tabs, in words only.
 */
export function AdminTabs({
	t,
	current,
	admin = false,
}: {
	t: Strings;
	/** The library's admin gets the tabs that are theirs alone. */
	admin?: boolean;
	current: Tab;
}) {
	const groups: [label: string, tabs: [Tab, string, string][]][] = [
		[
			t.navLibrary,
			[
				["overview", "/admin", t.tabOverview],
				...(admin
					? ([
							["log", "/admin/log", t.logTab],
							["settings", "/admin/settings", t.settingsTab],
						] as [Tab, string, string][])
					: []),
			],
		],
		[
			t.navPeople,
			[
				["members", "/admin/members", t.members],
				["invites", "/admin/invites", t.invites],
				...(admin
					? ([["messages", "/admin/messages", t.adminMessages]] as [
							Tab,
							string,
							string,
						][])
					: []),
			],
		],
		[
			t.navBooks,
			[
				["assets", "/admin/assets", t.assets],
				["loans", "/admin/loans", t.loans],
				["tagging", "/admin/tagging", t.tagging],
				["tags", "/admin/tags", t.tagProposals],
				// Merging look-alikes is for books; two drills are two drills.
				...(traits(libraryType()).duplicates
					? ([["duplicates", "/admin/duplicates", t.possibleDuplicates]] as [
							Tab,
							string,
							string,
						][])
					: []),
			],
		],
	];
	const here = groups
		.flatMap(([group, tabs]) =>
			tabs.map(([key, , text]) => ({ group, key, text })),
		)
		.find(({ key }) => key === current);
	const Here = ICONS[current];

	return (
		<nav className="tabs" aria-label={t.admin}>
			<details>
				<summary>
					<span className="tabs-icon">
						<Here size={20} aria-hidden="true" />
					</span>
					<span className="tabs-where">
						<span className="tabs-where-group">{here?.group}</span>
						<span className="tabs-here">{here?.text}</span>
					</span>
					<CaretDown size={20} aria-hidden="true" className="tabs-caret" />
				</summary>
				<div className="tabs-groups">
					{groups.map(([label, tabs]) => (
						<div key={label} className="tabs-group">
							<span className="tabs-group-label">{label}</span>
							{tabs.map(([key, href, text]) => {
								const Icon = ICONS[key];
								return (
									<a
										key={key}
										href={href}
										aria-current={key === current ? "page" : undefined}
									>
										<Icon size={20} aria-hidden="true" />
										{text}
									</a>
								);
							})}
						</div>
					))}
				</div>
			</details>
		</nav>
	);
}
