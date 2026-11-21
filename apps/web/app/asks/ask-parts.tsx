import type { AskView, OfferView } from "@cdl/contracts";
import type { Strings } from "../../lib/i18n.ts";

/** How soon, and for how long: today's stands out, the rest are plain. */
export function AskTags({
	ask,
	t,
}: {
	ask: Pick<AskView, "by" | "days">;
	t: Strings;
}) {
	return (
		<span className="ask-tags">
			<span className={`badge${ask.by === "today" ? " badge-warn" : ""}`}>
				{t.askByText(ask.by)}
			</span>
			<span className="badge">{t.askDaysText(ask.days)}</span>
		</span>
	);
}

/**
 * When the asker may come by, as the one who offered said it. "Now" and
 * "later today" hold for the day they were said on; after that, the time
 * is arranged as any loan's is.
 */
export function comeLine(
	offer: Pick<OfferView, "come" | "time" | "day">,
	t: Strings,
): string {
	const today = new Date().toISOString().slice(0, 10);
	return offer.come !== "usual" && offer.day !== today
		? t.comeText("usual", null)
		: t.comeText(offer.come, offer.time);
}
