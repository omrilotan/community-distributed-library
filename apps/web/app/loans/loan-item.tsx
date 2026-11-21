import type { LoanView } from "@cdl/contracts";
import type { Locale, Strings } from "../../lib/i18n.ts";
import type { Side } from "../../lib/loan-groups.ts";
import { loanTimer } from "../../lib/timer.ts";
import { PlainCover } from "../plain-cover.tsx";
import { LoanActions } from "./loan-actions.tsx";
import { comeLine } from "../asks/ask-parts.tsx";

/** One item of a group: its cover, its name, its clock and its own steps. */
export function LoanItem({
	loan,
	side,
	t,
	locale,
	back,
	actions = true,
}: {
	loan: LoanView;
	side: Side;
	t: Strings;
	locale: Locale;
	back: string;
	/** Its own steps; the list leaves them to the loan's page. */
	actions?: boolean;
}) {
	const timer = loanTimer(loan, locale, t);
	// What began as an ask is on no shelf: its page is the loan itself.
	const page = loan.ask ? `/loans/${loan.id}` : `/works/${loan.copy.workId}`;
	return (
		<li className="loan-item">
			<a href={page} aria-hidden="true" tabIndex={-1}>
				{loan.copy.coverUrl ? (
					<img alt="" src={loan.copy.coverUrl} />
				) : (
					<span className="thumb">
						<PlainCover title={loan.copy.title} size="thumb" />
					</span>
				)}
			</a>
			<div>
				<a className="loan-item-title" href={page}>
					<bdi>{loan.copy.title}</bdi>
				</a>
				{loan.copy.quantity > 1 ? (
					<span className="muted">
						{" "}
						· {t.partOfSet(loan.quantity, loan.copy.quantity)}
					</span>
				) : null}
				{loan.ask && loan.status === "accepted" ? (
					<div className="muted">
						{comeLine(loan.ask, t)}
						{loan.ask.note ? (
							<>
								{" · "}
								<bdi>{loan.ask.note}</bdi>
							</>
						) : null}
					</div>
				) : null}
				{timer ? (
					<div className={`muted${timer.overdue ? " overdue" : ""}`}>
						{timer.text}
					</div>
				) : null}
				{actions ? (
					<LoanActions loan={loan} side={side} t={t} back={back} item />
				) : null}
			</div>
		</li>
	);
}
