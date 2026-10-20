import type { LoanView } from "@cdl/contracts";
import type { Locale } from "./i18n.ts";

/** "on loan 5 days · due in 16 days", or "overdue by 3 days". Pure formatting. */
export function loanTimer(
	loan: LoanView,
	locale: Locale,
	t: {
		onLoanFor: (d: number) => string;
		dueIn: (d: number) => string;
		overdueBy: (d: number) => string;
	},
): { text: string; overdue: boolean } | null {
	if (!loan.startedAt) return null;
	const now = Math.floor(Date.now() / 1000);
	const end = loan.closedAt ?? now;
	const days = Math.max(0, Math.floor((end - loan.startedAt) / 86_400));
	if (loan.status !== "active" || !loan.dueAt)
		return { text: t.onLoanFor(days), overdue: false };
	// Overdue from the moment it is due, a day late from the first hour: not
	// "due in 0 days" for the day after.
	if (now > loan.dueAt) {
		const late = Math.max(1, Math.ceil((now - loan.dueAt) / 86_400));
		return {
			text: `${t.onLoanFor(days)} · ${t.overdueBy(late)}`,
			overdue: true,
		};
	}
	const left = Math.ceil((loan.dueAt - now) / 86_400);
	return { text: `${t.onLoanFor(days)} · ${t.dueIn(left)}`, overdue: false };
}
