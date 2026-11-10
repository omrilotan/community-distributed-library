import type { LoanView } from "@cdl/contracts";
import type { Locale, Strings } from "../../lib/i18n.ts";
import type { Side } from "../../lib/loan-groups.ts";
import { dateFormat } from "../../lib/dates.ts";
import { heldMinutes } from "./loan-actions.tsx";

/**
 * A loan in the list, or several with one person: one way in, named for
 * what happens next there (arrange the handoff, the time agreed, arrange
 * the return), with what is unread on it. Handing over, returning and the
 * rest, nudging included, are on the loan's page, with the conversation. A
 * request to the viewer keeps its answer here: accepting is the next step.
 */
export function NextStep({
	loans,
	side,
	t,
	locale,
}: {
	loans: LoanView[];
	side: Side;
	t: Strings;
	locale: Locale;
}) {
	const [lead, ...others] = loans as [LoanView, ...LoanView[]];
	const href = `/loans/${lead.id}`;
	const unread = loans.reduce((sum, loan) => sum + loan.unread, 0);
	const meeting = loans.find((loan) => loan.meeting)?.meeting ?? null;
	const day = dateFormat(locale, { weekday: "short" });
	const label = (() => {
		if (lead.status === "requested")
			return side === "borrower" ? t.viewRequest : null;
		if (lead.status === "accepted" || lead.status === "active") {
			if (meeting?.agreed)
				return t.meetingDetails(
					`${day.format(new Date(`${meeting.day}T12:00:00Z`))} ${t.periodName(meeting.period)}`,
				);
			return lead.status === "accepted" ? t.arrangeHandoff : t.arrangeReturn;
		}
		return t.viewLoan;
	})();
	// What is unread rides on the way in, as a badge.
	const withUnread = (text: string) => (
		<>
			{text}
			{unread ? (
				<span className="badge badge-unread">{t.unread(unread)}</span>
			) : null}
		</>
	);
	const held = heldMinutes(lead);
	const open = ["requested", "accepted", "active"].includes(lead.status);
	const finished = !open;

	return (
		<>
			{/* Said above the button: the owner has not heard of it yet. */}
			{held > 0 && side === "borrower" ? (
				<p className="muted loan-note">
					{t.requestHeld(lead.lender.displayName, held)}
				</p>
			) : null}
			<div className="actions next-step">
				{label === null ? (
					// A request to the viewer: accepting is the next step, here.
					<>
						<form
							action={`/api/loans/${lead.id}`}
							method="post"
							className="inline"
						>
							<input type="hidden" name="action" value="accept" />
							<input type="hidden" name="back" value="/loans" />
							{others.map((other) => (
								<input
									type="hidden"
									name="also"
									value={other.id}
									key={other.id}
								/>
							))}
							<button type="submit" className="small">
								{others.length ? t.acceptAll(loans.length) : t.accept}
							</button>
						</form>
						<a className="btn quiet" href={href}>
							{withUnread(t.viewRequest)}
						</a>
					</>
				) : (
					<a
						className={`btn${finished ? " quiet" : ""}`}
						href={`${href}${lead.status === "accepted" || lead.status === "active" ? "#handoff" : ""}`}
					>
						{withUnread(label)}
					</a>
				)}
			</div>
		</>
	);
}
