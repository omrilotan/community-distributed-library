import type { InviteState } from "@cdl/contracts";
import type { Strings } from "./i18n.ts";

/** An event's link is one day's when it is open for about a day. */
const ONE_DAY = 25 * 3600;

/**
 * Why the link cannot let them in, worded for what it was: one person's,
 * a group's, or one day's. Null for a link that can.
 */
export function whyNot(
	invite: InviteState,
	t: Pick<
		Strings,
		| "inviteOneUsed"
		| "inviteFull"
		| "inviteOver"
		| "inviteWasForDay"
		| "inviteOpensOn"
		| "inviteDay"
	>,
): string | null {
	const { state, maxUses = 1, startsAt = null, expiresAt } = invite;
	if (state === "used")
		return maxUses > 1 ? t.inviteFull(maxUses) : t.inviteOneUsed;
	if (state === "early" && startsAt !== null)
		return t.inviteOpensOn(t.inviteDay(startsAt));
	if (state === "expired") {
		if (startsAt !== null && expiresAt && expiresAt - startsAt <= ONE_DAY)
			return t.inviteWasForDay(t.inviteDay(startsAt));
		return t.inviteOver;
	}
	return null;
}
