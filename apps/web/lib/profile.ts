import { cache } from "react";
import { redirect } from "next/navigation";
import type { Me } from "@cdl/contracts";
import { core } from "./core.ts";
import { requireSession, signedOut } from "./session.ts";

/**
 * Who is signed in, fetched once per request however many places ask: the
 * layout for its badges, the page for its rules. React's cache() lasts for
 * one render, so nothing is ever stale across requests.
 */
export const getMe = cache(() => core<Me>("/v1/me"));

/**
 * Signed in *and* placed on the map. Pages that show distances call this;
 * a member with no area is sent to finish their profile first.
 */
export async function requireProfile(): Promise<Me> {
	await requireSession();
	const me = await getMe();
	// Turned away: sign in again. Anything else is core failing, which is
	// ours to say so about, not the member's session to lose.
	if (me.status === 401 || me.status === 403) signedOut(me.status);
	if (me.status !== 200) throw new Error(`core answered ${me.status}`);
	// No area yet: setup was left half-way. Back to its first step.
	if (!me.body.area && !me.body.community.compact) redirect("/start/setup");
	return me.body;
}
