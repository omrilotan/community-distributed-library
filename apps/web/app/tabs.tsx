"use client";

import { usePathname } from "next/navigation";
import { ArrowsLeftRight } from "@phosphor-icons/react/dist/csr/ArrowsLeftRight";
import { Books } from "@phosphor-icons/react/dist/csr/Books";
import { BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { User } from "@phosphor-icons/react/dist/csr/User";

interface Tab {
	href: string;
	label: string;
	icon: keyof typeof ICONS;
	badge?: number;
	/** The one in the middle: larger, in a ring. */
	main?: boolean;
}

/**
 * Phone navigation: a fixed bar within thumb reach. Everything a member does
 * daily is one tap, nothing is behind a menu. Hidden on wide screens, where
 * the topbar carries the same links.
 */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
	const pathname = usePathname();
	// The deepest tab that holds the page: on /shelf/add, Add rather than My
	// things.
	const holds = (href: string) =>
		href === "/"
			? pathname === "/"
			: pathname === href || pathname.startsWith(`${href}/`);
	const here = tabs
		.filter((tab) => holds(tab.href))
		.sort((a, b) => b.href.length - a.href.length)[0]?.href;
	const current = (href: string) => href === here;
	return (
		<nav className="tabbar" aria-label={label}>
			{tabs.map((tab) => (
				<a
					key={tab.href}
					href={tab.href}
					aria-current={current(tab.href) ? "page" : undefined}
					className={tab.main ? "tabbar-item tabbar-main" : "tabbar-item"}
				>
					<span className="tabbar-icon" aria-hidden="true">
						{ICONS[tab.icon]}
						{tab.badge ? (
							<span className="tabbar-badge">{tab.badge}</span>
						) : null}
					</span>
					<span className="tabbar-label">{tab.label}</span>
					{tab.badge ? <span className="sr-only">({tab.badge})</span> : null}
				</a>
			))}
		</nav>
	);
}

/**
 * One icon family for the whole app, at one weight: Phosphor, "regular". Each
 * import is its own module, so only these reach the bundle.
 */
const ICONS = {
	browse: <MagnifyingGlass size={24} />,
	shelf: <Books size={24} />,
	wishlist: <BookmarkSimple size={24} />,
	loans: <ArrowsLeftRight size={24} />,
	me: <User size={24} />,
	add: <Plus size={24} />,
};
