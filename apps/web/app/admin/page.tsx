import { cookies } from "next/headers";
import type { AttentionItem, CommunityStats } from "@cdl/contracts";
import { core } from "../../lib/core.ts";
import { strings, type Locale, type Strings } from "../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../ui.tsx";
import { AdminTabs } from "./tabs.tsx";
import { moderatorOrNull } from "./guard.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.admin);

export default async function AdminOverview({
	searchParams,
}: {
	searchParams: Promise<{
		reminders?: string;
		covers?: string;
		settled?: string;
		error?: string;
	}>;
}) {
	const me = await moderatorOrNull();
	const { reminders, covers, settled, error } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const [stats, attention] = await Promise.all([
		core<CommunityStats>("/v1/admin/stats"),
		core<{ items: AttentionItem[] }>("/v1/admin/attention"),
	]);
	const items = attention.status === 200 ? attention.body.items : [];
	return (
		<main>
			<PageHead
				title={t.admin}
				aside={
					// See what a member sees, before telling one where to click.
					// Back to the shelves: that is where a member starts.
					<a className="btn quiet secondary" href="/view-as?as=member&back=%2F">
						{t.viewAsMember}
					</a>
				}
			/>
			<AdminTabs t={t} current="overview" admin={me.role === "admin"} />
			{stats.status === 200 ? (
				<section className="stats">
					<Stat
						label={t.statMembers}
						value={stats.body.members}
						href="/admin/members"
					/>
					<Stat
						label={t.statModerators}
						value={stats.body.moderators}
						href="/admin/members"
					/>
					<Stat
						label={t.statCopies}
						value={stats.body.copies}
						href="/admin/assets"
					/>
					<Stat
						label={t.statLendable}
						value={stats.body.lendable}
						href="/admin/assets"
					/>
					<Stat
						label={t.statActiveLoans}
						value={stats.body.activeLoans}
						href="/admin/loans"
					/>
					<Stat
						label={t.statInvites}
						value={stats.body.activeInvites}
						href="/admin/invites"
					/>
				</section>
			) : null}
			<h2>{t.attention}</h2>
			{reminders ? <Callout>{t.remindersRan(reminders)}</Callout> : null}
			{covers ? <Callout>{t.coversTaken(covers)}</Callout> : null}
			{settled ? <Callout>{t.loanSettled}</Callout> : null}
			{error ? <Callout tone="warn">{t.adminActionFailed}</Callout> : null}
			{items.length === 0 ? (
				<Empty title={t.attentionNone} hint={t.attentionHint} />
			) : null}
			{items.map((item) => (
				<article className="card" key={item.reportId ?? item.loanId ?? ""}>
					<div>
						<bdi>
							<strong>
								{item.bookTitle || t.reportKindName(item.reportKind ?? "other")}
							</strong>
						</bdi>
						<div className="muted">
							{item.kind === "report" ? (
								<>
									{t.reportKindName(item.reportKind ?? "other")} ·{" "}
									<bdi>{item.borrowerName}</bdi>
									{item.lenderName ? (
										<>
											{" "}
											{t.reportAbout} <bdi>{item.lenderName}</bdi>
										</>
									) : null}
								</>
							) : (
								<>{t.loanParties(item.borrowerName, item.lenderName)}</>
							)}
						</div>
						{item.body ? (
							<p>
								“<bdi>{item.body}</bdi>”
							</p>
						) : null}
						{item.kind === "suspended" ? (
							<p className="muted">{t.settleHint}</p>
						) : null}
						<div className="actions">
							<span
								className={`badge${item.kind === "unanswered" ? "" : " badge-warn"}`}
							>
								{item.kind === "overdue"
									? t.overdueBy(item.days)
									: item.kind === "report"
										? t.reportedAgo(item.days)
										: item.kind === "suspended"
											? t.counterpartSuspended(item.suspendedName ?? "")
											: t.unansweredFor(item.days)}
							</span>
							{item.kind === "suspended" && item.loanId ? (
								<SettleLoan
									loanId={item.loanId}
									handedOver={item.loanStatus === "active"}
									t={t}
								/>
							) : null}
							{/* A moderator is not a party to the loan, so the thread
							    opens through the report that named it — or not at all,
							    unless the loan happens to be their own. */}
							{item.reportId && item.loanId ? (
								<a href={`/admin/reports/${item.reportId}`}>{t.readThread}</a>
							) : item.loanId && item.mine ? (
								<a href={`/loans/${item.loanId}`}>{t.messages}</a>
							) : null}
							{item.reportId ? (
								<>
									<form
										action={`/api/admin/reports/${item.reportId}`}
										method="post"
										className="inline"
									>
										<input type="hidden" name="action" value="resolve" />
										<button type="submit" className="quiet">
											{t.resolve}
										</button>
									</form>
									<form
										action={`/api/admin/reports/${item.reportId}`}
										method="post"
										className="inline"
									>
										<input type="hidden" name="action" value="dismiss" />
										<button type="submit" className="link">
											{item.reportKind === "loss" ? t.bookTurnedUp : t.dismiss}
										</button>
									</form>
								</>
							) : null}
						</div>
					</div>
				</article>
			))}
			<p className="muted">{t.overviewHint}</p>
		</main>
	);
}

/**
 * A suspended member's loan: before the handover it is called off; after it,
 * the book came back, or (asked twice) it is lost.
 */
function SettleLoan({
	loanId,
	handedOver,
	t,
}: {
	loanId: string;
	handedOver: boolean;
	t: Strings;
}) {
	const button = (outcome: string, label: string, kind = "quiet") => (
		<form
			action={`/api/admin/loans/${loanId}`}
			method="post"
			className="inline"
		>
			<input type="hidden" name="outcome" value={outcome} />
			<button type="submit" className={kind}>
				{label}
			</button>
		</form>
	);
	if (!handedOver) return button("cancelled", t.settleCancelled);
	return (
		<>
			{button("returned", t.settleReturned)}
			<details className="confirm">
				<summary>{t.settleLost}</summary>
				<form
					action={`/api/admin/loans/${loanId}`}
					method="post"
					className="callout"
				>
					<input type="hidden" name="outcome" value="lost" />
					<p>{t.settleLostConfirm}</p>
					<button type="submit" className="danger">
						{t.settleLostYes}
					</button>
				</form>
			</details>
		</>
	);
}

function Stat({
	label,
	value,
	href,
}: {
	label: string;
	value: number;
	href: string;
}) {
	return (
		<a className="stat card-link" href={href}>
			<strong>{value}</strong>
			<span className="muted">{label}</span>
		</a>
	);
}
