import type { ThreadReport } from "@cdl/contracts";

/**
 * A report, where it happened in the conversation: what kind, when, the
 * comment, what the moderators decided, and the words between the reporter
 * and the moderators. Shown to its author and to the moderators only.
 */
export function ReportEntry({
	report,
	label,
	time,
	status,
	moderatorsName,
	ownName,
	reply,
}: {
	report: ThreadReport;
	label: string;
	time: (at: number) => string;
	/** "Open", "Resolved"… already in the page's language. */
	status: string;
	/** What the reporter calls a reply from a moderator: "The moderators". */
	moderatorsName: string;
	/** On the reporter's own page, their replies say "You". */
	ownName?: string;
	/** Where this viewer's reply goes, with the words for the form. */
	reply: {
		action: string;
		back?: string;
		placeholder: string;
		send: string;
	} | null;
}) {
	return (
		<div className="bubble bubble-system report-entry">
			<strong>{label}</strong>
			{report.body ? <bdi>{report.body}</bdi> : null}
			<time dateTime={new Date(report.createdAt * 1000).toISOString()}>
				{time(report.createdAt)}
			</time>
			<p className="report-status">
				<span
					className={`badge${report.status === "open" ? " badge-warn" : " badge-ok"}`}
				>
					{status}
				</span>
				{report.resolution ? <bdi> {report.resolution}</bdi> : null}
			</p>
			{report.replies.length ? (
				<ol className="report-replies">
					{report.replies.map((entry) => (
						<li
							key={entry.id}
							className={entry.fromModerators ? "from-moderators" : ""}
						>
							<strong>
								<bdi>
									{entry.fromModerators
										? (entry.authorName ?? moderatorsName)
										: (ownName ?? entry.authorName)}
								</bdi>
							</strong>
							<bdi>{entry.body}</bdi>
							<time dateTime={new Date(entry.createdAt * 1000).toISOString()}>
								{time(entry.createdAt)}
							</time>
						</li>
					))}
				</ol>
			) : null}
			{reply ? (
				<form action={reply.action} method="post" className="report-reply">
					{reply.back ? (
						<input type="hidden" name="back" value={reply.back} />
					) : null}
					<input
						name="body"
						type="text"
						dir="auto"
						maxLength={1000}
						required
						aria-label={reply.placeholder}
						placeholder={reply.placeholder}
					/>
					<button type="submit" className="quiet">
						{reply.send}
					</button>
				</form>
			) : null}
		</div>
	);
}
