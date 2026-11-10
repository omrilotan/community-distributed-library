import type { LoanView } from "@cdl/contracts";

export type Side = "lender" | "borrower" | "holder";

/** Loans that wait on the same next step, so one tap moves them all. */
const TOGETHER = new Set(["requested", "accepted", "active"]);

/**
 * Who this side meets about a loan: the borrower meets whoever hands it
 * over (the reader before them on a relay, until the handover), else the
 * owner; the owner and that reader meet the borrower.
 */
export function counterpartId(loan: LoanView, side: Side): string {
	if (side !== "borrower") return loan.borrower.id;
	const handingOver = loan.status === "requested" || loan.status === "accepted";
	return (handingOver && loan.relayFrom?.id) || loan.lender.id;
}

/**
 * The loans between the viewer and one other person at one stage, kept in
 * the order they came: what is asked for together is accepted together,
 * met for together and returned together. A finished loan stands alone.
 */
export function groupLoans(loans: LoanView[], side: Side): LoanView[][] {
	const groups = new Map<string, LoanView[]>();
	for (const loan of loans) {
		const key = TOGETHER.has(loan.status)
			? `${counterpartId(loan, side)}:${loan.status}`
			: `alone:${loan.id}`;
		groups.set(key, [...(groups.get(key) ?? []), loan]);
	}
	return [...groups.values()];
}

/** The group a loan belongs to, from the viewer's loans on every side. */
export function groupOf(
	loanId: string,
	mine: { borrowing: LoanView[]; lending: LoanView[]; relaying: LoanView[] },
): { loans: LoanView[]; side: Side } | null {
	const sides: [LoanView[], Side][] = [
		[mine.relaying, "holder"],
		[mine.lending, "lender"],
		[mine.borrowing, "borrower"],
	];
	for (const [loans, side] of sides) {
		const group = groupLoans(loans, side).find((one) =>
			one.some((loan) => loan.id === loanId),
		);
		if (group) {
			// The loan asked about leads: its thread and handoff are the page's.
			const lead = group.find((loan) => loan.id === loanId)!;
			return {
				loans: [lead, ...group.filter((loan) => loan.id !== loanId)],
				side,
			};
		}
	}
	return null;
}
