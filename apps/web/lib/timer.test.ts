import { describe, expect, it } from "vitest";
import type { LoanView } from "@cdl/contracts";
import { loanTimer } from "./timer.ts";

const t = {
	onLoanFor: (d: number) => `on loan ${d}`,
	dueIn: (d: number) => `due in ${d}`,
	overdueBy: (d: number) => `overdue by ${d}`,
};
const now = () => Math.floor(Date.now() / 1000);
const loan = (dueAt: number) =>
	({
		status: "active",
		startedAt: now() - 10 * 86_400,
		closedAt: null,
		dueAt,
	}) as unknown as LoanView;

describe("a loan's timer", () => {
	it("is overdue from the hour after it was due, not due in 0 days", () => {
		expect(loanTimer(loan(now() - 3600), "en", t)).toEqual({
			text: "on loan 10 · overdue by 1",
			overdue: true,
		});
	});

	it("counts the days left, rounding up", () => {
		expect(loanTimer(loan(now() + 3600), "en", t)?.text).toBe(
			"on loan 10 · due in 1",
		);
		expect(loanTimer(loan(now() + 3 * 86_400), "en", t)?.text).toBe(
			"on loan 10 · due in 3",
		);
	});
});
