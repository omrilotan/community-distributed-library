import { cookies } from "next/headers";
import type {
	HandoffView,
	LoanThread,
	MyLoans,
	SlotOptions,
	ThreadMessage,
} from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { signedOut } from "../../../lib/session.ts";
import { requireProfile } from "../../../lib/profile.ts";
import { Callout, Empty } from "../../ui.tsx";
import { ScrollToEnd } from "../scroll-to-end.tsx";
import { LoanActions, counterpart } from "../loan-actions.tsx";
import { HandoffPanel } from "../handoff-panel.tsx";
import { AvailabilityNudge } from "../availability-nudge.tsx";
import { loanTimer } from "../../../lib/timer.ts";
import { ReportEntry } from "../../report-entry.tsx";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.loans);

/** One loan as a conversation: the book at the top, the two people talking, a composer at the bottom. */
export default async function LoanThreadPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		error?: string;
		nudged?: string;
		handoff?: string;
		extended?: string;
		report?: string;
	}>;
}) {
	const me = await requireProfile();
	const { id } = await params;
	const {
		error,
		nudged,
		handoff: handoffFlash,
		extended,
		report: reportOpen,
	} = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);

	const [thread, mine, handoffRes, slotsRes] = await Promise.all([
		core<LoanThread>(`/v1/loans/${encodeURIComponent(id)}/messages`),
		core<MyLoans>("/v1/me/loans"),
		core<{ handoff: HandoffView | null }>(
			`/v1/loans/${encodeURIComponent(id)}/handoff`,
		),
		core<SlotOptions>(`/v1/loans/${encodeURIComponent(id)}/slots`),
	]);
	const handoff = handoffRes.status === 200 ? handoffRes.body.handoff : null;
	const slots =
		slotsRes.status === 200
			? slotsRes.body
			: {
					days: [],
					options: [],
					myGridEmpty: false,
					theirGridEmpty: true,
					placeMissing: false,
				};
	if (thread.status === 401) signedOut(thread.status);
	if (thread.status !== 200) return <Empty title={t.noSuchLoan} />;

	const loan =
		mine.status === 200
			? [
					...mine.body.borrowing,
					...mine.body.lending,
					...mine.body.relaying,
				].find((entry) => entry.id === id)
			: undefined;
	const { viewerId, participants, messages, reports, open } = thread.body;
	const other =
		Object.entries(participants).find(
			([memberId]) => memberId !== viewerId,
		)?.[1] ?? "";
	const iAmLender = loan?.lender.id === me.id;
	const iAmBorrower = loan?.borrower.id === me.id;
	// On a relay, the reader handing the book on: they hold the code and mark
	// it handed, like an owner would, and have nothing else to do here.
	const iAmHolder = Boolean(loan) && !iAmLender && !iAmBorrower;
	// The book came from the previous reader, so its owner never saw the state
	// it arrived in. Saying so is the borrower's to do, and worth prompting.
	const relayed = Boolean(loan?.relayFrom) && iAmBorrower;
	// The other side was suspended: no messages or nudges reach them, and the
	// moderators are who to write to about the loan.
	const side = iAmHolder ? "holder" : iAmLender ? "lender" : "borrower";
	const ownerAside =
		iAmLender && Boolean(loan?.relayFrom) && loan?.status === "accepted";
	const them = loan ? counterpart(loan, side) : null;
	const cutOff = Boolean(open && them?.suspended);
	const timer = loan ? loanTimer(loan, locale, t) : null;
	const timeFormat = dateFormat(locale, { timeStyle: "short" });
	const dayFormat = dateFormat(locale, { dateStyle: "medium" });
	const stampFormat = dateFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	// The request note is the first thing said; render it as the borrower's opening line.
	const opening: ThreadMessage[] =
		loan?.message && loan.borrower.id
			? [
					{
						id: `request-${loan.id}`,
						loanId: loan.id,
						authorId: loan.borrower.id,
						body: loan.message,
						createdAt: loan.requestedAt,
					},
				]
			: [];
	const log = [...opening, ...messages];
	// Reports go where they happened, among the messages.
	// What happened to the loan itself goes where it happened too.
	const notes: { at: number; note: string }[] = [];
	if (loan?.startedAt)
		notes.push({
			at: loan.startedAt,
			note: `${t.handedOn(dayFormat.format(loan.startedAt * 1000))}${
				loan.dueAt ? ` · ${t.dueOn(dayFormat.format(loan.dueAt * 1000))}` : ""
			}`,
		});
	if (loan?.status === "completed" && loan.closedAt)
		notes.push({
			at: loan.closedAt,
			note: t.returnedOn(dayFormat.format(loan.closedAt * 1000)),
		});
	if (loan?.status === "declined" || loan?.status === "cancelled")
		notes.push({
			at: loan.closedAt ?? loan.decidedAt ?? loan.requestedAt,
			note: t.loanStatus(loan.status),
		});
	const timeline = [
		...log.map((message) => ({
			at: message.createdAt,
			message,
			report: null,
			note: null,
		})),
		...reports.map((report) => ({
			at: report.createdAt,
			message: null,
			report,
			note: null,
		})),
		...notes.map(({ at, note }) => ({ at, message: null, report: null, note })),
		// At the same moment, what happened to the loan comes before what was said.
	].sort(
		(a, b) => a.at - b.at || Number(Boolean(b.note)) - Number(Boolean(a.note)),
	);

	let lastDay = "";
	return (
		<main className="chat">
			<header className="chat-head">
				{/* The title is the link; the cover is the same link for a thumb. */}
				{loan?.copy.coverUrl ? (
					<a
						href={`/works/${loan.copy.workId}`}
						aria-hidden="true"
						tabIndex={-1}
					>
						<img className="thumb" alt="" src={loan.copy.coverUrl} />
					</a>
				) : null}
				<div>
					<h1>
						{loan ? (
							<>
								<a
									href={`/works/${loan.copy.workId}`}
									style={{ color: "inherit", textDecoration: "none" }}
								>
									<bdi>{loan.copy.title}</bdi>
								</a>
								{loan.copy.quantity > 1 ? (
									<span className="muted">
										{" "}
										· {t.partOfSet(loan.quantity, loan.copy.quantity)}
									</span>
								) : null}
							</>
						) : (
							<bdi>{t.loans}</bdi>
						)}
					</h1>
					<div className="muted">
						<bdi>{other}</bdi>
						{loan ? (
							<>
								{" · "}
								<span
									className={`badge${loan.status === "accepted" || loan.status === "active" ? " badge-ok" : ""}${timer?.overdue ? " badge-warn" : ""}`}
								>
									{t.loanStatus(loan.status)}
								</span>
								{timer ? <span> · {timer.text}</span> : null}
							</>
						) : null}
					</div>
				</div>
				<span className="spacer" />
				<a className="btn secondary quiet" href="/loans">
					{t.loans}
				</a>
			</header>

			{cutOff && them ? (
				<section className="suspended-note" aria-labelledby="suspended-title">
					<ShieldWarning size={28} weight="duotone" aria-hidden="true" />
					<div>
						<h2 id="suspended-title">
							{t.counterpartSuspended(them.displayName)}
						</h2>
						<p>{t.counterpartSuspendedBody(them.displayName)}</p>
						<a className="btn secondary" href="?report=other#report">
							{t.writeToModerators}
						</a>
					</div>
				</section>
			) : null}
			{error === "nudged" ? (
				<Callout tone="warn">{t.nudgedRecently}</Callout>
			) : null}
			{error === "waiting" ? (
				<Callout tone="warn">{t.extendWaiting}</Callout>
			) : null}
			{error &&
			error !== "nudged" &&
			error !== "code" &&
			error !== "waiting" ? (
				<Callout tone="warn">{t.loanActionFailed}</Callout>
			) : null}

			<section className="chat-log">
				{timeline.length === 0 && !cutOff ? (
					<p className="bubble-system bubble">{t.noMessages}</p>
				) : null}
				{timeline.map((entry) => {
					const day = dayFormat.format(entry.at * 1000);
					const separator =
						day !== lastDay ? <span className="day">{day}</span> : null;
					lastDay = day;
					if (entry.note) {
						return (
							<div key={`note-${entry.at}`} style={{ display: "contents" }}>
								{separator}
								<p className="bubble bubble-system">{entry.note}</p>
							</div>
						);
					}
					if (entry.report) {
						return (
							<div key={entry.report.id} style={{ display: "contents" }}>
								{separator}
								<ReportEntry
									report={entry.report}
									label={t.youReported(t.reportKindName(entry.report.kind))}
									time={(at) => stampFormat.format(at * 1000)}
									status={t.reportStatusName(entry.report.status)}
									moderatorsName={t.theModerators}
									ownName={t.you}
									reply={{
										action: `/api/reports/${entry.report.id}/replies`,
										back: `/loans/${id}`,
										placeholder: t.writeToModerators,
										send: t.send,
									}}
								/>
							</div>
						);
					}
					const message = entry.message!;
					const mine = message.authorId === viewerId;
					return (
						<div key={message.id} style={{ display: "contents" }}>
							{separator}
							<article className={`bubble${mine ? " bubble-me" : ""}`}>
								<bdi>{message.body}</bdi>
								{message.via ? (
									<span className="bubble-via">{t.sentVia(message.via)}</span>
								) : null}
								<time
									dateTime={new Date(message.createdAt * 1000).toISOString()}
								>
									{timeFormat.format(message.createdAt * 1000)}
								</time>
							</article>
						</div>
					);
				})}
				{nudged ? <p className="bubble bubble-system">{t.nudgeSent}</p> : null}
				{handoffFlash === "confirm" ? (
					<p className="bubble bubble-system">{t.timeAgreed}</p>
				) : null}
				{handoffFlash === "complete" ? (
					<p className="bubble bubble-system">{t.handoffDone}</p>
				) : null}
				{extended ? <p className="bubble bubble-system">{t.extended}</p> : null}
				<ScrollToEnd />
			</section>

			{/* A request is the moment to fill the grid in: the handoff comes next.
			    Not with a suspended member: no handover gets arranged with them. */}
			{loan?.status === "requested" && slots.myGridEmpty && !cutOff ? (
				<AvailabilityNudge t={t} />
			) : null}
			{/* On a relay's way out the owner is not at the handover: the holder
			    and the borrower arrange it between them. */}
			{loan && ownerAside ? (
				<p className="muted">
					{t.relayHandover(
						loan.relayFrom?.displayName ?? "",
						loan.borrower.displayName,
					)}
				</p>
			) : null}
			{loan && !cutOff && !ownerAside ? (
				<HandoffPanel
					loan={loan}
					side={iAmLender || iAmHolder ? "lender" : "borrower"}
					handoff={handoff}
					options={slots.options}
					days={slots.days}
					myGridEmpty={slots.myGridEmpty}
					placeMissing={slots.placeMissing}
					theirGridEmpty={slots.theirGridEmpty}
					t={t}
					locale={locale}
					flash={error === "code" ? "code" : undefined}
				/>
			) : null}
			{loan ? (
				<LoanActions
					loan={loan}
					side={iAmHolder ? "holder" : iAmLender ? "lender" : "borrower"}
					t={t}
					back={`/loans/${id}`}
				/>
			) : null}

			{loan && open && !iAmHolder ? (
				<details
					className="report"
					id="report"
					open={Boolean(reportOpen) || cutOff}
				>
					<summary className="muted">{t.reportProblem}</summary>
					<form action={`/api/loans/${id}/report`} method="post">
						<label htmlFor="kind">{t.reportKind}</label>
						<select
							id="kind"
							name="kind"
							defaultValue={reportOpen === "damage" ? "damage" : "other"}
						>
							{(["damage", "loss", "no_show", "conduct", "other"] as const).map(
								(kind) => (
									<option value={kind} key={kind}>
										{t.reportKindName(kind)}
									</option>
								),
							)}
						</select>
						<label htmlFor="body">{t.reportBody}</label>
						<input
							id="body"
							name="body"
							type="text"
							dir="auto"
							maxLength={1000}
						/>
						<p className="muted">
							{relayed
								? t.reportRelayHint(loan!.lender.displayName)
								: t.reportHint}
						</p>
						<button type="submit" className="secondary">
							{t.reportSend}
						</button>
					</form>
				</details>
			) : null}

			{cutOff && them ? (
				<p className="muted" style={{ textAlign: "center" }}>
					{t.composerSuspended(them.displayName)}
				</p>
			) : open ? (
				<form
					action={`/api/loans/${id}/messages`}
					method="post"
					className="composer"
				>
					<input
						name="body"
						type="text"
						dir="auto"
						maxLength={1000}
						required
						autoComplete="off"
						placeholder={t.writeMessage}
					/>
					<button type="submit">{t.send}</button>
				</form>
			) : (
				<p className="muted" style={{ textAlign: "center" }}>
					{t.threadClosed}
				</p>
			)}
		</main>
	);
}
