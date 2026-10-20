import type { LoanView } from "@cdl/contracts";
import type { Strings } from "../../lib/i18n.ts";

/** The levers each side has at each stage. One form per lever; no JavaScript needed. */
export function LoanActions({
	loan,
	side,
	t,
	back,
	compact = false,
}: {
	loan: LoanView;
	side: "lender" | "borrower" | "holder";
	t: Strings;
	back: string;
	compact?: boolean;
}) {
	const open = ["requested", "accepted", "active"].includes(loan.status);
	// A suspended member is not nudged; the moderators take it from here.
	const reachable = !counterpart(loan, side).suspended;
	const button = (
		action: string,
		label: string,
		kind: "primary" | "quiet" | "link",
	) => (
		<form
			action={`/api/loans/${loan.id}`}
			method="post"
			className="inline"
			key={action}
		>
			<input type="hidden" name="action" value={action} />
			<input type="hidden" name="back" value={back} />
			<button
				type="submit"
				className={kind === "primary" ? (compact ? "quiet" : "") : kind}
			>
				{label}
			</button>
		</form>
	);
	// Core lets the reader handing a relay on do this one thing.
	if (side === "holder")
		return loan.status === "accepted" ? (
			<div className="actions">{button("handed", t.markHanded, "primary")}</div>
		) : null;
	return (
		<div className="actions">
			{side === "lender" && loan.status === "requested" ? (
				<>
					{button("accept", t.accept, "primary")}
					{button("decline", t.decline, "link")}
				</>
			) : null}
			{loan.status === "accepted"
				? button("handed", t.markHanded, "primary")
				: null}
			{loan.status === "active"
				? button("returned", t.markReturned, "primary")
				: null}
			{/* While someone waits, only the owner can extend: core says so. */}
			{loan.status === "active" &&
			loan.extensions < 2 &&
			!(side === "borrower" && loan.someoneWaiting)
				? button(
						"extend",
						side === "borrower" ? t.extend : t.extendForThem,
						"quiet",
					)
				: null}
			{open && reachable ? (
				loan.nudgeCooldown > 0 ? (
					<span className="muted">{t.nudgedRecently}</span>
				) : (
					button("nudge", t.nudge, "quiet")
				)
			) : null}
			{loan.status === "requested" && side === "borrower"
				? button("cancel", t.cancel, "link")
				: null}
			{loan.status === "accepted" ? button("cancel", t.cancel, "link") : null}
		</div>
	);
}

/**
 * Who this side deals with: the borrower deals with whoever hands the book
 * over (the reader before them on a relay, until the handover), else the
 * owner; the owner and that reader deal with the borrower.
 */
export function counterpart(
	loan: LoanView,
	side: "lender" | "borrower" | "holder",
): { displayName: string; suspended: boolean } {
	if (side !== "borrower") return loan.borrower;
	const handingOver = loan.status === "requested" || loan.status === "accepted";
	return (handingOver && loan.relayFrom) || loan.lender;
}
