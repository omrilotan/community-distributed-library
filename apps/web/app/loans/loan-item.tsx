import type { LoanView } from "@cdl/contracts";
import type { Locale, Strings } from "../../lib/i18n.ts";
import type { Side } from "../../lib/loan-groups.ts";
import { loanTimer } from "../../lib/timer.ts";
import { PlainCover } from "../plain-cover.tsx";
import { LoanActions } from "./loan-actions.tsx";

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
	return (
		<li className="loan-item">
			<a href={`/works/${loan.copy.workId}`} aria-hidden="true" tabIndex={-1}>
				{loan.copy.coverUrl ? (
					<img alt="" src={loan.copy.coverUrl} />
				) : (
					<span className="thumb">
						<PlainCover title={loan.copy.title} size="thumb" />
					</span>
				)}
			</a>
			<div>
				<a className="loan-item-title" href={`/works/${loan.copy.workId}`}>
					<bdi>{loan.copy.title}</bdi>
				</a>
				{loan.copy.quantity > 1 ? (
					<span className="muted">
						{" "}
						· {t.partOfSet(loan.quantity, loan.copy.quantity)}
					</span>
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
