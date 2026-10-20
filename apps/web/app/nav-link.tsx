"use client";

import { usePathname } from "next/navigation";

/** A nav link that knows when it is the current page. */
export function NavLink({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const current = href === "/" ? pathname === "/" : pathname.startsWith(href);
	return (
		<a href={href} aria-current={current ? "page" : undefined}>
			{children}
		</a>
	);
}
