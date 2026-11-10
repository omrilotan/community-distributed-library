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
	others = [],
	item = false,
	children,
}: {
	loan: LoanView;
	side: "lender" | "borrower" | "holder";
	t: Strings;
	back: string;
	compact?: boolean;
	/**
	 * The other loans with the same person at the same stage: the next step
	 * moves them all, and the steps for one alone are on each item.
	 */
	others?: LoanView[];
	/** One item of a group: its own steps, quietly, and no nudge. */
	item?: boolean;
	children?: ReactNode;
}) {
	const grouped = others.length > 0;
	// A request its owner has not heard of yet (core holds it a few minutes):
	// the asker can still take it back unheard.
	const heldFor = heldMinutes(loan);
	const held = heldFor > 0;
	const button = (
		action: string,
		label: string,
		kind: "primary" | "quiet" | "link",
		all = false,
	) => (
		<form
			action={`/api/loans/${loan.id}`}
			method="post"
			className={
				kind === "link" && (compact || item) ? "inline actions-end" : "inline"
			}
			key={action}
		>
			<input type="hidden" name="action" value={action} />
			<input type="hidden" name="back" value={back} />
			{all
				? others.map((other) => (
						<input type="hidden" name="also" value={other.id} key={other.id} />
					))
				: null}
			<button
				type="submit"
				className={kind === "primary" ? (compact ? "small" : "") : kind}
			>
				{label}
			</button>
		</form>
	);
	// One item of a group: its own next step, quiet, and its own way out.
	if (item)
		return (
			<div className="actions">
				{side === "lender" && loan.status === "requested"
					? button("accept", t.accept, "quiet")
					: null}
				{loan.status === "accepted"
					? button("handed", t.markHanded, "quiet")
					: null}
				{loan.status === "active"
					? button("returned", t.markReturned, "quiet")
					: null}
				{loan.status === "active" &&
				loan.extensions < 2 &&
				!(side === "borrower" && loan.someoneWaiting)
					? button(
							"extend",
							side === "borrower" ? t.extend : t.extendForThem,
							"quiet",
						)
					: null}
				{side === "lender" && loan.status === "requested"
					? button("decline", t.decline, "link")
					: null}
				{(loan.status === "requested" && side === "borrower") ||
				(loan.status === "accepted" && side !== "holder")
					? button("cancel", t.cancel, "link")
					: null}
			</div>
		);
	const count = others.length + 1;
	// A group: the next step for them all.
	if (grouped)
		return (
			<div className="actions">
				{side === "lender" && loan.status === "requested"
					? button("accept", t.acceptAll(count), "primary", true)
					: null}
				{loan.status === "accepted"
					? button("handed", t.markAllHanded(count), "primary", true)
					: null}
				{loan.status === "active" && side !== "holder"
					? button("returned", t.markAllReturned(count), "primary", true)
					: null}
				{children}
			</div>
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

/**
 * Minutes left before the owner hears of a new request (core holds it a
 * few); 0 once they have, or for anything but a request.
 */
export function heldMinutes(loan: LoanView): number {
	return loan.status === "requested"
		? Math.max(
				0,
				Math.ceil(
					(loan.requestedAt + REQUEST_HOLD_MINUTES * 60 - Date.now() / 1000) /
						60,
				),
			)
		: 0;
}

/**
 * A gentle reminder to the other side, at the end of the conversation it
 * is about: once a day, not while the owner has yet to hear of a request,
 * and not to a suspended member.
 */
export function Nudge({
	loan,
	side,
	t,
	back,
}: {
	loan: LoanView;
	side: "lender" | "borrower" | "holder";
	t: Strings;
	back: string;
}) {
	const open = ["requested", "accepted", "active"].includes(loan.status);
	if (side === "holder" || !open) return null;
	if (counterpart(loan, side).suspended || heldMinutes(loan) > 0) return null;
	return (
		<div className="chat-nudge">
			{loan.nudgeCooldown > 0 ? (
				<span className="muted">{t.nudgedRecently}</span>
			) : (
				<form action={`/api/loans/${loan.id}`} method="post" className="inline">
					<input type="hidden" name="action" value="nudge" />
					<input type="hidden" name="back" value={back} />
					<span className="muted">{t.nudgeAsk}</span>{" "}
					<button type="submit" className="quiet">
						{t.nudge}
					</button>
				</form>
			)}
		</div>
	);
}
