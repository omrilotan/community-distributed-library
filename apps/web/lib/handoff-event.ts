import type { HandoffView, LoanView } from "@cdl/contracts";
import type { Strings } from "./i18n.ts";
import { appBase } from "./site.ts";
import { type CalendarEvent, handoffWindow } from "./calendar.ts";

/** The calendar entry for a loan's handoff, as one side of it sees it. */
export function handoffEvent(
	loan: LoanView,
	handoff: HandoffView,
	side: "lender" | "borrower",
	t: Strings,
): CalendarEvent {
	// Who they meet: the borrower meets whoever hands it over, the reader
	// before them on a relay's way out, else the owner.
	const other =
		side === "lender"
			? loan.borrower.displayName
			: handoff.direction === "out"
				? (loan.relayFrom ?? loan.lender).displayName
				: loan.lender.displayName;
	return {
		uid: `handoff-${handoff.id}@${new URL(appBase()).host}`,
		title: t.calendarTitle(handoff.direction, loan.copy.title, other),
		details: `${appBase()}/loans/${loan.id}`,
		// Only what this side may see: the borrower gets the place once agreed.
		location: handoff.place,
		...handoffWindow(handoff.day, handoff.period),
	};
}
