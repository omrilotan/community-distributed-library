import { Hono } from "hono";
import {
	CloseReport,
	FileReport,
	PostReportReply,
	problem,
	type ReportThread,
	type ReportView,
} from "@cdl/contracts";
import { markFound, markLost } from "./sets.ts";
import type { Env } from "./env.ts";
import { dropStaleHandoffs } from "./stale-handoffs.ts";
import { tell } from "./notify.ts";
import { moderator, viewerWith } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { denied, json } from "./problem.ts";
import { onCopyAvailable } from "./waitlist.ts";
import { emit } from "./events.ts";
import { loanReports } from "./routes-loans.ts";

export const reports = new Hono<{ Bindings: Env }>();
/**
 * A party to a loan flags a problem with the other party. A loss closes the
 * loan and takes the copy out of circulation; everything else is a note for
 * the moderators. The system records, never accuses.
 */
reports.post("/v1/loans/:id/report", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const loanId = c.req.param("id");
	const parsed = FileReport.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid report"));

	const loan = await c.env.DB.prepare(
		`SELECT l.copy_id, l.status, l.quantity, l.borrower_id, l.lender_id, l.relay_from,
		        l.community_id, e.title,
		        o.email AS owner_email, o.locale AS owner_locale,
		        rf.display_name AS relay_name
		   FROM loans l JOIN copies c ON c.id = l.copy_id JOIN editions e ON e.id = c.edition_id
		   JOIN members o ON o.id = l.lender_id
		   LEFT JOIN members rf ON rf.id = l.relay_from
		  WHERE l.id = ? AND (l.borrower_id = ? OR l.lender_id = ?)`,
	)
		.bind(loanId, member.id, member.id)
		.first<{
			copy_id: string;
			status: string;
			quantity: number;
			borrower_id: string;
			lender_id: string;
			relay_from: string | null;
			community_id: string;
			title: string;
			owner_email: string;
			owner_locale: "en" | "he";
			relay_name: string | null;
		}>();
	if (!loan) return json(c, problem(404, "No such loan"));
	// A book that came from the previous reader rather than from its owner:
	// damage is about whoever handed it over, not about the owner.
	const relayed = member.id === loan.borrower_id && loan.relay_from !== null;
	const subject = relayed
		? loan.relay_from!
		: member.id === loan.borrower_id
			? loan.lender_id
			: loan.borrower_id;

	const id = ulid();
	const statements = [
		c.env.DB.prepare(
			`INSERT INTO reports (id, community_id, reporter_id, subject_member, loan_id, kind, body, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
		).bind(
			id,
			loan.community_id,
			member.id,
			subject,
			loanId,
			parsed.data.kind,
			parsed.data.body ?? null,
			now(),
		),
	];
	// Only a loan that is out can be lost; the report says so on the loan too.
	const losing = parsed.data.kind === "loss" && loan.status === "active";
	const at = now();
	if (losing) {
		statements.push(
			c.env.DB.prepare(
				"UPDATE loans SET status = 'lost', outcome = 'lost', closed_at = ?, lost_mark = ? WHERE id = ? AND status = 'active'",
			).bind(at, id, loanId),
			// A whole item is lost; part of a set comes off its count.
			markLost(c.env, loan.copy_id, loan.quantity, loanId, id),
			dropStaleHandoffs(c.env, loan.copy_id),
		);
	}
	const written = await c.env.DB.batch(statements);
	// Lost by this report, not by one filed a moment before it.
	if (losing && written[1]?.meta.changes) {
		c.executionCtx.waitUntil(
			emit(c.env, c.executionCtx, "loan.closed", { loanId }),
		);
		c.executionCtx.waitUntil(
			emit(c.env, c.executionCtx, "copy.state_changed", {
				copyId: loan.copy_id,
			}),
		);
		c.executionCtx.waitUntil(
			c.env.CONVO.closed(loanId, at).catch((error: unknown) =>
				console.error("[convo] close failed", loanId, error),
			),
		);
	}

	// The owner was not at the handover, so on a relay they hear it from us.
	if (relayed && parsed.data.kind === "damage") {
		const reporter = await c.env.DB.prepare(
			"SELECT display_name FROM members WHERE id = ?",
		)
			.bind(member.id)
			.first<{ display_name: string }>();
		c.executionCtx.waitUntil(
			tell(c.env, {
				kind: "copy_damage",
				to: loan.owner_email,
				locale: loan.owner_locale,
				url: `${c.env.APP_URL}/loans/${loanId}`,
				bookTitle: loan.title,
				reporterName: reporter?.display_name ?? "",
				fromName: loan.relay_name,
				body: parsed.data.body ?? null,
			}).catch((error: unknown) =>
				console.error("[reports] owner notify failed", error),
			),
		);
	}

	// Moderators hear straight away; a report is a request for a human.
	const names = await c.env.DB.prepare(
		"SELECT id, display_name FROM members WHERE id IN (?, ?)",
	)
		.bind(member.id, subject)
		.all<{ id: string; display_name: string }>();
	const name = (memberId: string) =>
		names.results.find((row) => row.id === memberId)?.display_name ?? "";
	const moderators = await c.env.DB.prepare(
		`SELECT m.email, m.locale FROM memberships ms JOIN members m ON m.id = ms.member_id
		  WHERE ms.community_id = ? AND ms.role IN ('moderator', 'admin') AND ms.status = 'active' AND m.id != ?`,
	)
		.bind(loan.community_id, member.id)
		.all<{ email: string; locale: "en" | "he" }>();
	c.executionCtx.waitUntil(
		Promise.all(
			moderators.results.map((row) =>
				tell(c.env, {
					kind: "report",
					to: row.email,
					locale: row.locale,
					url: `${c.env.APP_URL}/admin`,
					reportKind: parsed.data.kind,
					reporterName: name(member.id),
					subjectName: name(subject),
					bookTitle: loan.title,
					body: parsed.data.body ?? null,
				}),
			),
		).catch((error: unknown) =>
			console.error("[reports] notify failed", error),
		),
	);
	return c.json({ id }, 201);
});

reports.get("/v1/admin/reports", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const { results } = await c.env.DB.prepare(
		`SELECT r.id, r.kind, r.body, r.status, r.resolution, r.created_at, r.closed_at,
		        p.id AS reporter_id, p.display_name AS reporter_name,
		        s.id AS subject_id, s.display_name AS subject_name,
		        l.id AS loan_id, e.title
		   FROM reports r
		   JOIN members p ON p.id = r.reporter_id
		   LEFT JOIN members s ON s.id = r.subject_member
		   LEFT JOIN loans l ON l.id = r.loan_id
		   LEFT JOIN copies c ON c.id = l.copy_id
		   LEFT JOIN editions e ON e.id = c.edition_id
		  WHERE r.community_id = ?
		  ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT 100`,
	)
		.bind(who.communityId)
		.all<Row>();
	return c.json({ reports: results.map(view) });
});

/**
 * The conversation a report points at, for the moderator handling it. Reading
 * somebody's messages is a real intrusion, so it takes an open or closed
 * report naming that loan — there is no way to browse threads from here — and
 * the privacy page says plainly that this is what a report allows.
 */
reports.get("/v1/admin/reports/:id/thread", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));

	const row = await c.env.DB.prepare(
		`SELECT r.id, r.kind, r.body, r.status, r.resolution, r.created_at, r.closed_at,
		        p.id AS reporter_id, p.display_name AS reporter_name,
		        s.id AS subject_id, s.display_name AS subject_name,
		        l.id AS loan_id, e.title,
		        b.id AS borrower_id, b.display_name AS borrower_name,
		        o.id AS lender_id, o.display_name AS lender_name
		   FROM reports r
		   JOIN members p ON p.id = r.reporter_id
		   LEFT JOIN members s ON s.id = r.subject_member
		   JOIN loans l ON l.id = r.loan_id
		   JOIN members b ON b.id = l.borrower_id
		   JOIN members o ON o.id = l.lender_id
		   JOIN copies c ON c.id = l.copy_id
		   JOIN editions e ON e.id = c.edition_id
		  WHERE r.id = ? AND r.community_id = ?`,
	)
		.bind(c.req.param("id"), who.communityId)
		.first<
			Row & {
				borrower_id: string;
				borrower_name: string;
				lender_id: string;
				lender_name: string;
			}
		>();
	// No loan on the report means there is no conversation to read.
	if (!row) return json(c, problem(404, "No such report"));

	const [messages, reports] = await Promise.all([
		c.env.CONVO.thread(row.loan_id!),
		loanReports(c.env, row.loan_id!),
	]);
	const thread: ReportThread = {
		report: view(row),
		reports,
		loanId: row.loan_id!,
		participants: {
			[row.borrower_id]: row.borrower_name,
			[row.lender_id]: row.lender_name,
		},
		messages,
	};
	return c.json(thread);
});

/**
 * The member who filed a report writes to the moderators about it. The member
 * it is about never sees this.
 */
reports.post("/v1/reports/:id/replies", async (c) => {
	const { member, forbidden } = await viewerWith(c, "messages:write");
	if (!member) return denied(c, forbidden);
	const parsed = PostReportReply.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Empty reply"));
	const report = await reportFor(c.env, c.req.param("id"));
	if (!report || report.reporter_id !== member.id)
		return json(c, problem(404, "No such report"));
	await addReply(c.env, report.id, member.id, false, parsed.data.body);

	const moderators = await c.env.DB.prepare(
		`SELECT m.email, m.locale FROM memberships ms JOIN members m ON m.id = ms.member_id
		  WHERE ms.community_id = ? AND ms.role IN ('moderator', 'admin') AND ms.status = 'active' AND m.id != ?`,
	)
		.bind(report.community_id, member.id)
		.all<{ email: string; locale: "en" | "he" }>();
	c.executionCtx.waitUntil(
		Promise.all(
			moderators.results.map((row) =>
				tell(c.env, {
					kind: "report_update",
					to: row.email,
					locale: row.locale,
					url: `${c.env.APP_URL}/admin/reports/${report.id}`,
					bookTitle: report.title,
					event: "reply",
					toModerators: true,
					body: parsed.data.body,
				}),
			),
		).catch((error: unknown) =>
			console.error("[reports] reply notify failed", error),
		),
	);
	return c.body(null, 204);
});

/** A moderator writes to the member who filed the report. */
reports.post("/v1/admin/reports/:id/replies", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = PostReportReply.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Empty reply"));
	const report = await reportFor(c.env, c.req.param("id"));
	if (!report || report.community_id !== who.communityId)
		return json(c, problem(404, "No such report"));
	await addReply(c.env, report.id, who.id, true, parsed.data.body);
	c.executionCtx.waitUntil(
		tellReporter(c.env, report, "reply", parsed.data.body),
	);
	return c.body(null, 204);
});

reports.post("/v1/admin/reports/:id/:action", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const action = c.req.param("action");
	if (action !== "resolve" && action !== "dismiss")
		return json(c, problem(404, "No such action"));
	const parsed = CloseReport.safeParse(
		(await c.req.json().catch(() => null)) ?? {},
	);
	if (!parsed.success) return json(c, problem(422, "Invalid resolution"));

	const report = await c.env.DB.prepare(
		"SELECT kind, loan_id FROM reports WHERE id = ? AND community_id = ? AND status = 'open'",
	)
		.bind(c.req.param("id"), who.communityId)
		.first<{ kind: string; loan_id: string | null }>();
	if (!report) return json(c, problem(404, "No open report"));

	const closed = await c.env.DB.prepare(
		"UPDATE reports SET status = ?, resolution = ?, closed_at = ?, closed_by = ? WHERE id = ? AND status = 'open'",
	)
		.bind(
			action === "resolve" ? "resolved" : "dismissed",
			parsed.data.resolution ?? null,
			now(),
			who.id,
			c.req.param("id"),
		)
		.run();
	// Closed by another moderator a moment ago.
	if (!closed.meta.changes) return json(c, problem(404, "No open report"));
	// The member who filed it hears what was decided.
	const filed = await reportFor(c.env, c.req.param("id"));
	if (filed)
		c.executionCtx.waitUntil(
			tellReporter(
				c.env,
				filed,
				action === "resolve" ? "resolved" : "dismissed",
				parsed.data.resolution ?? null,
			),
		);

	// A dismissed loss means the book turned up: back on the shelf goes what
	// this report took off it. A report filed before the handover, or after
	// another had already told the loss, took nothing.
	if (report.kind === "loss" && action === "dismiss" && report.loan_id) {
		const loan = await c.env.DB.prepare(
			"SELECT copy_id, quantity FROM loans WHERE id = ?",
		)
			.bind(report.loan_id)
			.first<{ copy_id: string; quantity: number }>();
		if (loan) {
			const [found] = await c.env.DB.batch(
				markFound(
					c.env,
					loan.copy_id,
					loan.quantity,
					report.loan_id,
					c.req.param("id"),
				),
			);
			if (found?.meta.changes)
				c.executionCtx.waitUntil(
					onCopyAvailable(c.env, loan.copy_id).catch((error: unknown) =>
						console.error("[waitlist] offer failed", loan.copy_id, error),
					),
				);
		}
	}
	return c.body(null, 204);
});

function view(row: Row): ReportView {
	return {
		id: row.id,
		kind: row.kind,
		body: row.body,
		status: row.status,
		resolution: row.resolution,
		reporter: { id: row.reporter_id, displayName: row.reporter_name },
		subject: row.subject_id
			? { id: row.subject_id, displayName: row.subject_name ?? "" }
			: null,
		loan: row.loan_id ? { id: row.loan_id, bookTitle: row.title ?? "" } : null,
		createdAt: row.created_at,
		closedAt: row.closed_at,
	};
}

interface Row {
	id: string;
	kind: ReportView["kind"];
	body: string | null;
	status: ReportView["status"];
	resolution: string | null;
	created_at: number;
	closed_at: number | null;
	reporter_id: string;
	reporter_name: string;
	subject_id: string | null;
	subject_name: string | null;
	loan_id: string | null;
	title: string | null;
}

interface FiledReport {
	id: string;
	community_id: string;
	reporter_id: string;
	loan_id: string | null;
	title: string | null;
	email: string;
	locale: "en" | "he";
}

async function reportFor(env: Env, id: string): Promise<FiledReport | null> {
	return env.DB.prepare(
		`SELECT r.id, r.community_id, r.reporter_id, r.loan_id, e.title, m.email, m.locale
		   FROM reports r
		   JOIN members m ON m.id = r.reporter_id
		   LEFT JOIN loans l ON l.id = r.loan_id
		   LEFT JOIN copies c ON c.id = l.copy_id
		   LEFT JOIN editions e ON e.id = c.edition_id
		  WHERE r.id = ?`,
	)
		.bind(id)
		.first<FiledReport>();
}

async function addReply(
	env: Env,
	reportId: string,
	authorId: string,
	fromModerators: boolean,
	body: string,
): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO report_replies (id, report_id, author_id, from_moderators, body, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
	)
		.bind(ulid(), reportId, authorId, fromModerators ? 1 : 0, body, now())
		.run();
}

function tellReporter(
	env: Env,
	report: FiledReport,
	event: "reply" | "resolved" | "dismissed",
	body: string | null,
): Promise<void> {
	return tell(env, {
		kind: "report_update",
		to: report.email,
		locale: report.locale,
		url: report.loan_id
			? `${env.APP_URL}/loans/${report.loan_id}`
			: `${env.APP_URL}/loans`,
		bookTitle: report.title,
		event,
		toModerators: false,
		body,
	})
		.then(() => undefined)
		.catch((error: unknown) =>
			console.error("[reports] reporter notify failed", error),
		);
}
