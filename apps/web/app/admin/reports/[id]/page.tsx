import { cookies } from "next/headers";
import type { ReportThread } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { strings, type Locale } from "../../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../../ui.tsx";
import { AdminTabs } from "../../tabs.tsx";
import { moderatorOrNull } from "../../guard.ts";
import { ReportEntry } from "../../../report-entry.tsx";
import { dateFormat } from "../../../../lib/dates.ts";
import { titled } from "../../../../lib/page-title.ts";

export const generateMetadata = titled(
	(t) => `${t.reportProblem} · ${t.admin}`,
);

/**
 * A reported conversation, for the moderator handling it. Read-only: a
 * moderator decides what to do about what was said, and does not join in.
 */
export default async function ReportThreadPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const me = await moderatorOrNull();
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const page = await core<ReportThread>(`/v1/admin/reports/${id}/thread`);
	if (page.status !== 200) return <Empty title={t.noReportThread} />;
	const { report, participants, messages, reports } = page.body;
	// Every report on this loan goes where it happened, among the messages.
	const timeline = [
		...messages.map((message) => ({
			at: message.createdAt,
			message,
			report: null,
		})),
		...reports.map((entry) => ({
			at: entry.createdAt,
			message: null,
			report: entry,
		})),
	].sort((a, b) => a.at - b.at);

	const day = dateFormat(locale, { dateStyle: "medium" });
	const time = dateFormat(locale, { timeStyle: "short" });
	const stamp = dateFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	let lastDay = "";

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="overview" admin={me.role === "admin"} />

			<section className="card">
				<div>
					<bdi>
						<strong>{report.loan?.bookTitle ?? ""}</strong>
					</bdi>
					<div className="muted">
						{t.reportKindName(report.kind)} ·{" "}
						<a
							href={`/admin/members/${encodeURIComponent(report.reporter.id)}`}
						>
							<bdi>{report.reporter.displayName}</bdi>
						</a>
						{report.subject ? (
							<>
								{" "}
								{t.reportAbout}{" "}
								<a
									href={`/admin/members/${encodeURIComponent(report.subject.id)}`}
								>
									<bdi>{report.subject.displayName}</bdi>
								</a>
							</>
						) : null}
						{" · "}
						{day.format(report.createdAt * 1000)}
					</div>
					{report.body ? (
						<p>
							“<bdi>{report.body}</bdi>”
						</p>
					) : null}
					<div className="actions">
						<span
							className={`badge${report.status === "open" ? " badge-warn" : ""}`}
						>
							{t.reportStatusName(report.status)}
						</span>
						{report.status === "open" ? (
							<>
								<form
									action={`/api/admin/reports/${report.id}`}
									method="post"
									className="inline"
								>
									<input type="hidden" name="action" value="resolve" />
									<button type="submit" className="quiet">
										{t.resolve}
									</button>
								</form>
								<form
									action={`/api/admin/reports/${report.id}`}
									method="post"
									className="inline"
								>
									<input type="hidden" name="action" value="dismiss" />
									<button type="submit" className="link">
										{report.kind === "loss" ? t.bookTurnedUp : t.dismiss}
									</button>
								</form>
							</>
						) : report.resolution ? (
							<span className="muted">
								<bdi>{report.resolution}</bdi>
							</span>
						) : null}
					</div>
				</div>
			</section>

			<Callout tone="warn">{t.moderationNote}</Callout>

			<section className="chat-log">
				{timeline.length === 0 ? (
					<p className="bubble bubble-system">{t.noMessages}</p>
				) : null}
				{timeline.map((entry) => {
					const when = day.format(entry.at * 1000);
					const separator =
						when !== lastDay ? <span className="day">{when}</span> : null;
					lastDay = when;
					if (entry.report) {
						return (
							<div key={entry.report.id} style={{ display: "contents" }}>
								{separator}
								<ReportEntry
									report={entry.report}
									label={t.reportedBy(
										participants[entry.report.reporterId] ?? "",
										t.reportKindName(entry.report.kind),
									)}
									time={(at) => stamp.format(at * 1000)}
									status={t.reportStatusName(entry.report.status)}
									moderatorsName={t.theModerators}
									reply={{
										action: `/api/admin/reports/${entry.report.id}/replies`,
										placeholder: t.writeToReporter(
											participants[entry.report.reporterId] ?? "",
										),
										send: t.send,
									}}
								/>
							</div>
						);
					}
					const message = entry.message!;
					// Nobody's "own" side here: both parties are being read.
					return (
						<div key={message.id} style={{ display: "contents" }}>
							{separator}
							<article className="bubble">
								<bdi className="muted">
									{participants[message.authorId] ?? ""}
								</bdi>
								<bdi>{message.body}</bdi>
								<time
									dateTime={new Date(message.createdAt * 1000).toISOString()}
								>
									{time.format(message.createdAt * 1000)}
								</time>
							</article>
						</div>
					);
				})}
			</section>
		</main>
	);
}
