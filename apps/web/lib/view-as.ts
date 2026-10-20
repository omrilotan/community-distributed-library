import { cookies } from "next/headers";
import type { Me } from "@cdl/contracts";

/**
 * A moderator looking at the library the way a member does. It is a view, not
 * a role: the account keeps every permission it had, and the API would still
 * accept a moderator call made by hand. What it changes is what the pages
 * offer, which is the thing worth checking before telling somebody where to
 * click. The banner in the layout says which view is on, so nobody forgets.
 *
 * It never shows one member what another member sees. A moderator reads a
 * conversation only through a report that named it (decision 0010 of the
 * privacy page), and this must not become a way around that.
 */
export const VIEW_COOKIE = "view-as";

export async function viewingAsMember(): Promise<boolean> {
	return (await cookies()).get(VIEW_COOKIE)?.value === "member";
}

/** Moderators, and the admin, who can do all a moderator can. */
export function moderates(role: Me["role"] | undefined): boolean {
	return role === "moderator" || role === "admin";
}

/** The role the pages should honour: their own, unless they asked to step down. */
export async function shownRole(me: Me): Promise<Me["role"]> {
	if (!moderates(me.role)) return me.role;
	return (await viewingAsMember()) ? "member" : me.role;
}
