import type { Me } from "@cdl/contracts";
import { requireProfile } from "../../lib/profile.ts";
import { moderates, shownRole } from "../../lib/view-as.ts";

/**
 * The moderator, or null when the viewer is a plain member (the page then
 * explains) — including a moderator who asked to see the library as one.
 */
/** The library's admin, or null (moderators included): the admin's own pages. */
export async function adminOrNull(): Promise<Me | null> {
	const me = await requireProfile();
	return (await shownRole(me)) === "admin" ? me : null;
}

export async function moderatorOrNull(): Promise<Me | null> {
	const me = await requireProfile();
	return moderates(await shownRole(me)) ? me : null;
}
