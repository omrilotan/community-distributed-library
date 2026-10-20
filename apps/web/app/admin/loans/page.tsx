import { cookies } from "next/headers";
import type { AdminLoanPage } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.loans} · ${t.admin}`);

/**
 * Who has what: the community's loans, open ones first and soonest due at the
 * top. What was said stays between the two; a moderator reads a conversation
 * only through a report.
 */
export default async function AdminLoans({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; page?: string }>;
}) {
	const me = await moderatorOrNull();
	const params = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const all = params.status === "all";
	const page = Math.max(1, Number(params.page ?? 1) || 1);
	const list = await core<AdminLoanPage>(
		`/v1/admin/loans?status=${all ? "all" : "open"}&page=${page}`,
	);
	const body = list.status === 200 ? list.body : null;
	const date = dateFormat(locale, { dateStyle: "medium" });
	const now = Date.now() / 1000;
	const href = (to: { all?: boolean; page?: number }) =>
		`/admin/loans?status=${(to.all ?? all) ? "all" : "open"}&page=${to.page ?? 1}`;
	const member = (person: { id: string; displayName: string }) => (
		<a href={`/admin/members/${encodeURIComponent(person.id)}`}>
			<bdi>{person.displayName}</bdi>
		</a>
	);

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="loans" admin={me.role === "admin"} />

			<p className="filter-row" role="group" aria-label={t.loans}>
				<span className="muted">{t.loans}</span>
				<span className="filter-chips">
					<a
						className="chip"
						href={href({ all: false })}
						aria-current={all ? undefined : "true"}
					>
						{t.adminLoansOpen}
					</a>
					<a
						className="chip"
						href={href({ all: true })}
						aria-current={all ? "true" : undefined}
					>
						{t.adminLoansAll}
					</a>
				</span>
			</p>

			{!body || body.loans.length === 0 ? (
				<Empty title={t.adminLoansNone} />
			) : (
				<>
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>{t.adminLoansBook}</th>
									<th>{t.adminLoansLender}</th>
									<th>{t.adminLoansBorrower}</th>
									<th>{t.colStatus}</th>
									<th>{t.adminLoansSince}</th>
									<th>{t.adminLoansDue}</th>
								</tr>
							</thead>
							<tbody>
								{body.loans.map((loan) => {
									const overdue =
										loan.status === "active" &&
										loan.dueAt !== null &&
										loan.dueAt < now;
									return (
										<tr key={loan.id}>
											<td>
												<a
													href={`/works/${encodeURIComponent(loan.book.workId)}`}
												>
													<bdi>{loan.book.title}</bdi>
												</a>
											</td>
											<td>{member(loan.lender)}</td>
											<td>{member(loan.borrower)}</td>
											<td>
												<span
													className={`badge${overdue ? " badge-warn" : loan.status === "active" ? " badge-ok" : ""}`}
												>
													{t.loanStatus(loan.status)}
												</span>
											</td>
											<td>
												{date.format(
													(loan.startedAt ?? loan.requestedAt) * 1000,
												)}
											</td>
											<td>
												{loan.dueAt ? date.format(loan.dueAt * 1000) : "—"}
												{overdue ? (
													<span className="muted">
														{" "}
														· {t.adminLoansOverdue}
													</span>
												) : null}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					{body.pages > 1 ? (
						<nav className="pager" aria-label={t.loans}>
							{page > 1 ? (
								<a className="btn secondary" href={href({ page: page - 1 })}>
									{t.newer}
								</a>
							) : null}
							<span className="muted">{t.pageOf(page, body.pages)}</span>
							{page < body.pages ? (
								<a className="btn secondary" href={href({ page: page + 1 })}>
									{t.older}
								</a>
							) : null}
						</nav>
					) : null}
				</>
			)}
		</main>
	);
}
