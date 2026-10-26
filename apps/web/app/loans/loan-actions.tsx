import type { ReactNode } from "react";
import { REQUEST_HOLD_MINUTES, type LoanView } from "@cdl/contracts";
import type { Strings } from "../../lib/i18n.ts";

/**
 * The levers each side has at each stage. One form per lever; no JavaScript
 * needed. In a list (`compact`) they make one row: the next step filled, the
 * rest quiet, then `children` (the way into the loan), and a step back
 * (cancel, decline) at the row's end.
 */
export function LoanActions({
	loan,
	side,
	t,
	back,
	compact = false,
	children,
}: {
	loan: LoanView;
	side: "lender" | "borrower" | "holder";
	t: Strings;
	back: string;
	compact?: boolean;
	children?: ReactNode;
}) {
	const open = ["requested", "accepted", "active"].includes(loan.status);
	// A suspended member is not nudged; the moderators take it from here.
	const reachable = !counterpart(loan, side).suspended;
	// A request its owner has not heard of yet (core holds it a few minutes):
	// the asker can still take it back unheard, and nobody nudges about it.
	const heldFor =
		loan.status === "requested"
			? Math.ceil(
					(loan.requestedAt + REQUEST_HOLD_MINUTES * 60 - Date.now() / 1000) /
						60,
				)
			: 0;
	const held = heldFor > 0;
	const button = (
		action: string,
		label: string,
		kind: "primary" | "quiet" | "link",
	) => (
		<form
			action={`/api/loans/${loan.id}`}
			method="post"
			className={kind === "link" && compact ? "inline actions-end" : "inline"}
			key={action}
		>
			<input type="hidden" name="action" value={action} />
			<input type="hidden" name="back" value={back} />
			<button
				type="submit"
				className={kind === "primary" ? (compact ? "small" : "") : kind}
			>
				{label}
			</button>
		</form>
	);
	// Core lets the reader handing a relay on do this one thing.
	if (side === "holder")
		return loan.status === "accepted" || children ? (
			<div className="actions">
				{loan.status === "accepted"
					? button("handed", t.markHanded, "primary")
					: null}
				{children}
			</div>
		) : null;
	return (
		<>
			{/* Said above the buttons: a sentence, not one of them. */}
			{loan.status === "requested" && side === "borrower" && held ? (
				<p className="muted loan-note">
					{t.requestHeld(loan.lender.displayName, heldFor)}
				</p>
			) : null}
			<div className="actions">
				{side === "lender" && loan.status === "requested"
					? button("accept", t.accept, "primary")
					: null}
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
				{open && reachable && !held ? (
					loan.nudgeCooldown > 0 ? (
						<span className="muted">{t.nudgedRecently}</span>
					) : (
						button("nudge", t.nudge, "quiet")
					)
				) : null}
				{children}
				{/* The steps back, last. */}
				{side === "lender" && loan.status === "requested"
					? button("decline", t.decline, "link")
					: null}
				{loan.status === "requested" && side === "borrower"
					? button("cancel", t.cancel, "link")
					: null}
				{loan.status === "accepted" ? button("cancel", t.cancel, "link") : null}
			</div>
		</>
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
