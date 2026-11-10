import { cookies } from "next/headers";
import type {
	Availability,
	LoanView,
	MyLoans,
	WaitlistEntry,
} from "@cdl/contracts";
import { core } from "../../lib/core.ts";
import { strings, type Locale, type Strings } from "../../lib/i18n.ts";
import { signedOut } from "../../lib/session.ts";
import { requireProfile } from "../../lib/profile.ts";
import { loanTimer } from "../../lib/timer.ts";
import { Callout, Empty, PageHead } from "../ui.tsx";
import { PlainCover } from "../plain-cover.tsx";
import { AvailabilityNudge } from "./availability-nudge.tsx";
import { PushToggle } from "../push-toggle.tsx";
import { pushLabels } from "../../lib/push-labels.ts";
import { dateFormat } from "../../lib/dates.ts";
import { titled } from "../../lib/page-title.ts";
import { groupLoans, type Side } from "../../lib/loan-groups.ts";
import { LoanItem } from "./loan-item.tsx";
import { NextStep } from "./next-step.tsx";

export const generateMetadata = titled((t) => t.loans);

/** A loan that has run its course: kept for the record, hidden until asked. */
const FINISHED = new Set(["completed", "cancelled", "declined", "lost"]);

/**
 * Both sides of every open loan. The last month of closed ones is there too,
 * behind one link, so what still needs doing is what the page shows.
 */
export default async function LoansPage({
	searchParams,
}: {
	searchParams: Promise<{
		error?: string;
		nudged?: string;
		extended?: string;
		past?: string;
	}>;
}) {
	const me = await requireProfile();
	// Everyone close by: nobody's area is worth a line.
	const showAreas = !me.community.compact;
	const { error, nudged, extended, past } = await searchParams;
	const showPast = past === "1";
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);

	const [mine, queue] = await Promise.all([
		core<MyLoans>("/v1/me/loans"),
		core<{ entries: WaitlistEntry[] }>("/v1/me/waitlist"),
	]);
	if (mine.status === 401) signedOut(mine.status);
	const all =
		mine.status === 200
			? mine.body
			: { borrowing: [], lending: [], relaying: [] };
	const hidden = [...all.borrowing, ...all.lending, ...all.relaying].filter(
		(loan) => FINISHED.has(loan.status),
	).length;
	const shown = (loans: LoanView[]) =>
		showPast ? loans : loans.filter((loan) => !FINISHED.has(loan.status));
	const borrowing = shown(all.borrowing);
	const lending = shown(all.lending);
	const relaying = shown(all.relaying);
	const waiting = queue.status === 200 ? queue.body.entries : [];
	// A request just in is the moment to set one's times, if none are set.
	const asked = lending.some((loan) => loan.status === "requested");
	const grid = asked ? await core<Availability>("/v1/me/availability") : null;
	const gridEmpty = grid?.status === 200 && grid.body.slots.length === 0;
	const dateTime = dateFormat(locale, {
		dateStyle: "short",
		timeStyle: "short",
	});

	return (
		<main>
			<PageHead
				title={t.loans}
				aside={
					hidden ? (
						<a href={showPast ? "/loans" : "/loans?past=1"} rel="nofollow">
							{showPast ? t.hidePastLoans : `${t.showPastLoans} (${hidden})`}
						</a>
					) : null
				}
			/>
			{nudged ? <Callout>{t.nudgeSent}</Callout> : null}
			{extended ? <Callout>{t.extended}</Callout> : null}
			{error ? (
				<Callout tone="warn">
					{error === "nudged"
						? t.nudgedRecently
						: error === "waiting"
							? t.extendWaiting
							: t.loanActionFailed}
				</Callout>
			) : null}
			{/* Loans move on a neighbour's answer: hearing at once matters here.
			    Shown only while this device has notifications off. */}
			<PushToggle labels={pushLabels(t)} nudge={t.pushNudge} />

			<h2>{t.incoming}</h2>
			{gridEmpty ? <AvailabilityNudge t={t} /> : null}
			{lending.length === 0 ? <Empty title={t.noIncoming} /> : null}
			{groupLoans(lending, "lender").map((group) => (
				<LoanEntry
					key={group[0]!.id}
					showAreas={showAreas}
					loans={group}
					side="lender"
					t={t}
					locale={locale}
				/>
			))}

			{relaying.length ? (
				<>
					<h2>{t.relaying}</h2>
					<p className="muted">{t.relayingHint}</p>
					{groupLoans(relaying, "holder").map((group) => (
						<LoanEntry
							key={group[0]!.id}
							showAreas={showAreas}
							loans={group}
							side="holder"
							t={t}
							locale={locale}
						/>
					))}
				</>
			) : null}

			<h2>{t.myRequests}</h2>
			{borrowing.length === 0 ? (
				<Empty
					title={t.noRequests}
					hint={t.noRequestsHint}
					// Nothing going on at all: the way to start is to look around.
					action={
						lending.length === 0 && relaying.length === 0
							? { href: "/", label: t.emptyBrowse }
							: undefined
					}
				/>
			) : null}
			{groupLoans(borrowing, "borrower").map((group) => (
				<LoanEntry
					key={group[0]!.id}
					showAreas={showAreas}
					loans={group}
					side="borrower"
					t={t}
					locale={locale}
				/>
			))}

			<h2>{t.waitlistTitle}</h2>
			{waiting.length === 0 ? <p className="muted">{t.waitlistEmpty}</p> : null}
			{waiting.map((entry) => (
				<article className="card" key={entry.id}>
					<a href={`/works/${entry.workId}`} aria-hidden="true" tabIndex={-1}>
						{entry.coverUrl ? (
							<img alt="" src={entry.coverUrl} />
						) : (
							<span className="thumb">
								<PlainCover title={entry.title} size="thumb" />
							</span>
						)}
					</a>
					<div>
						<bdi>
							<strong>
								<a
									href={`/works/${entry.workId}`}
									style={{ color: "inherit", textDecoration: "none" }}
								>
									{entry.title}
								</a>
							</strong>
						</bdi>
						<div className="muted">
							<bdi>{entry.authors.join(", ")}</bdi> ·{" "}
							{t.waitlistPosition(entry.position)}
						</div>
						{entry.offer ? (
							<div className="callout">
								{t.offerHeld(dateTime.format(entry.offer.expiresAt * 1000))}{" "}
								<a href={`/works/${entry.workId}`}>{t.request}</a>
							</div>
						) : null}
						<form
							action={`/api/waitlist/${entry.id}`}
							method="post"
							className="inline"
						>
							<input type="hidden" name="back" value="/loans" />
							<button type="submit" className="link">
								{t.waitlistLeave}
							</button>
						</form>
					</div>
				</article>
			))}
		</main>
	);
}

/** One loan as a row, or several with the same person as one card. */
function LoanEntry({
	loans,
	...rest
}: {
	loans: LoanView[];
	side: Side;
	t: Strings;
	locale: Locale;
	showAreas?: boolean;
}) {
	return loans.length === 1 ? (
		<LoanRow loan={loans[0]!} {...rest} />
	) : (
		<LoanGroup loans={loans} {...rest} />
	);
}

/**
 * Several loans with one person at one stage: one card, one next step for
 * them all, and each item with its own steps for when only one moves.
 */
function LoanGroup({
	loans,
	side,
	t,
	locale,
	showAreas = true,
}: {
	loans: LoanView[];
	side: Side;
	t: Strings;
	locale: Locale;
	showAreas?: boolean;
}) {
	const lead = loans[0]!;
	const other =
		side === "borrower"
			? lead.status === "requested" || lead.status === "accepted"
				? (lead.relayFrom ?? lead.lender)
				: lead.lender
			: lead.borrower;
	const area = "areaLabel" in other ? (other.areaLabel as string | null) : null;
	const live = lead.status === "accepted" || lead.status === "active";
	const overdue = loans.some((loan) => loanTimer(loan, locale, t)?.overdue);
	return (
		<article className="card loan-group">
			<div>
				<div className="loan-group-head">
					<a href={`/loans/${lead.id}`}>
						<bdi>{other.displayName}</bdi>
					</a>
					{showAreas && area ? (
						<span className="muted">
							{" · "}
							<bdi>{area}</bdi>
						</span>
					) : null}
				</div>
				<div className="loan-status">
					<span
						className={`badge${live ? " badge-ok" : ""}${overdue ? " badge-warn" : ""}`}
					>
						{t.loanStatus(lead.status)}
					</span>
					{loans.some((loan) => loan.needsTime) ? (
						<a className="badge badge-warn" href={`/loans/${lead.id}#handoff`}>
							{t.needsTime}
						</a>
					) : null}
				</div>
				<ul className="loan-items">
					{loans.map((loan) => (
						<LoanItem
							key={loan.id}
							loan={loan}
							side={side}
							t={t}
							locale={locale}
							back="/loans"
							actions={false}
						/>
					))}
				</ul>
				<NextStep loans={loans} side={side} t={t} locale={locale} />
			</div>
		</article>
	);
}

function LoanRow({
	loan,
	side,
	t,
	locale,
	showAreas = true,
}: {
	loan: LoanView;
	side: "lender" | "borrower" | "holder";
	t: Strings;
	locale: Locale;
	showAreas?: boolean;
}) {
	const other = side === "borrower" ? loan.lender : loan.borrower;
	const timer = loanTimer(loan, locale, t);
	const relay =
		loan.relayFrom && loan.relayFrom.id !== loan.lender.id
			? t.relayVia(loan.relayFrom.displayName)
			: null;
	const when = dateFormat(locale, { dateStyle: "medium" }).format(
		loan.requestedAt * 1000,
	);
	const live = loan.status === "accepted" || loan.status === "active";
	return (
		<article className="card">
			{/* The title beside it is the link; this one is for a pointer only. */}
			<a href={`/loans/${loan.id}`} aria-hidden="true" tabIndex={-1}>
				{loan.copy.coverUrl ? (
					<img alt="" src={loan.copy.coverUrl} />
				) : (
					<span className="thumb">
						<PlainCover title={loan.copy.title} size="thumb" />
					</span>
				)}
			</a>
			<div>
				<bdi>
					<strong>
						<a
							href={`/loans/${loan.id}`}
							style={{ color: "inherit", textDecoration: "none" }}
						>
							{loan.copy.title}
						</a>
					</strong>
				</bdi>
				{loan.copy.quantity > 1 ? (
					<span className="muted">
						{" "}
						· {t.partOfSet(loan.quantity, loan.copy.quantity)}
					</span>
				) : null}
				<div className="muted">
					<bdi>{other.displayName}</bdi>
					{showAreas && other.areaLabel ? (
						<>
							{" · "}
							<bdi>{other.areaLabel}</bdi>
						</>
					) : null}
				</div>
				{/* Where it stands, and when: the time left once there is one,
				    else the day it was asked for. */}
				<div className="loan-status">
					<span
						className={`badge${live ? " badge-ok" : ""}${timer?.overdue ? " badge-warn" : ""}`}
					>
						{t.loanStatus(loan.status)}
					</span>
					<span className="muted">{timer ? timer.text : when}</span>
					{relay ? <span className="badge">{relay}</span> : null}
					{/* A day since it was accepted and no time on the table yet. */}
					{loan.needsTime ? (
						<a className="badge badge-warn" href={`/loans/${loan.id}#handoff`}>
							{t.needsTime}
						</a>
					) : null}
				</div>
				<NextStep loans={[loan]} side={side} t={t} locale={locale} />
			</div>
		</article>
	);
}
