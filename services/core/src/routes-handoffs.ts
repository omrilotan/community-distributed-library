import { Hono, type Context } from "hono";
import {
	Availability,
	CompleteHandoff,
	ProposeHandoff,
	problem,
	type HandoffView,
	type Period,
	type SlotOption,
} from "@cdl/contracts";
import { dropStaleHandoffs } from "./stale-handoffs.ts";
import { BACK_WITH_OWNER } from "./sets.ts";
import type { Env } from "./env.ts";
import { tell } from "./notify.ts";
import { viewer, viewerWith } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { denied, json } from "./problem.ts";
import { onCopyAvailable } from "./waitlist.ts";
import { emit } from "./events.ts";

export const handoffs = new Hono<{ Bindings: Env }>();

const PERIODS: Period[] = ["morning", "afternoon", "evening"];
const HORIZON_DAYS = 14;
/** My weekly windows and my meeting place. */
handoffs.get("/v1/me/availability", async (c) => {
	const { member, forbidden } = await viewerWith(c, "profile:read");
	if (!member) return denied(c, forbidden);
	const [slots, place] = await Promise.all([
		c.env.DB.prepare(
			"SELECT weekday, period FROM availability WHERE member_id = ?",
		)
			.bind(member.id)
			.all<{ weekday: number; period: Period }>(),
		c.env.DB.prepare(
			"SELECT meeting_place, meeting_note FROM members WHERE id = ?",
		)
			.bind(member.id)
			.first<{ meeting_place: string | null; meeting_note: string | null }>(),
	]);
	return c.json({
		slots: slots.results,
		meetingPlace: place?.meeting_place ?? null,
		meetingNote: place?.meeting_note ?? null,
	});
});

handoffs.put("/v1/me/availability", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.scopes.includes("loans:write")) return denied(c, true);
	const parsed = Availability.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid availability"));
	const { slots, meetingPlace, meetingNote } = parsed.data;

	await c.env.DB.batch([
		c.env.DB.prepare("DELETE FROM availability WHERE member_id = ?").bind(
			member.id,
		),
		...slots.map((slot) =>
			c.env.DB.prepare(
				"INSERT OR IGNORE INTO availability (member_id, weekday, period) VALUES (?, ?, ?)",
			).bind(member.id, slot.weekday, slot.period),
		),
		c.env.DB.prepare("UPDATE members SET meeting_place = ? WHERE id = ?").bind(
			meetingPlace || null,
			member.id,
		),
		...(meetingNote === undefined
			? []
			: [
					c.env.DB.prepare(
						"UPDATE members SET meeting_note = ? WHERE id = ?",
					).bind(meetingNote || null, member.id),
				]),
	]);
	return c.body(null, 204);
});

/**
 * Options for this loan: the next two weeks, marked where both parties are
 * free. Days where only the caller is free are listed too — the other side
 * may not have filled in a grid yet.
 */
handoffs.get("/v1/loans/:id/slots", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const loan = await loanFor(c.env, c.req.param("id"), member.id);
	if (!loan) return json(c, problem(404, "No such loan"));

	const counterpart =
		loan.status === "accepted" ? loan.giver.id : loan.lenderId;
	const { results } = await c.env.DB.prepare(
		"SELECT member_id, weekday, period FROM availability WHERE member_id IN (?, ?)",
	)
		.bind(loan.borrowerId, counterpart)
		.all<{ member_id: string; weekday: number; period: Period }>();
	const mine = new Set(
		results
			.filter((r) => r.member_id === member.id)
			.map((r) => `${r.weekday}:${r.period}`),
	);
	const other = member.id === loan.borrowerId ? counterpart : loan.borrowerId;
	const theirs = new Set(
		results
			.filter((r) => r.member_id === other)
			.map((r) => `${r.weekday}:${r.period}`),
	);

	const options: SlotOption[] = [];
	// Every day of the window, free or not: the picker draws them all.
	const days: string[] = [];
	const start = new Date();
	for (let offset = 1; offset <= HORIZON_DAYS; offset += 1) {
		const date = new Date(start.getTime() + offset * 86_400_000);
		const day = date.toISOString().slice(0, 10);
		const weekday = date.getUTCDay();
		days.push(day);
		for (const period of PERIODS) {
			const key = `${weekday}:${period}`;
			if (mine.has(key) || theirs.has(key)) {
				options.push({
					day,
					period,
					both: mine.has(key) && theirs.has(key),
					mine: mine.has(key),
					theirs: theirs.has(key),
				});
			}
		}
	}
	// The host has not said where: ask them now, before any time is put forward.
	const hostId = loan.status === "accepted" ? loan.giver.id : loan.lenderId;
	return c.json({
		days,
		options,
		myGridEmpty: mine.size === 0,
		theirGridEmpty: theirs.size === 0,
		placeMissing: (await meetingPlace(c.env, hostId)).place === null,
	});
});

/** Either party proposes a slot; a newer proposal replaces an unanswered one. */
handoffs.post("/v1/loans/:id/handoff/propose", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const loanId = c.req.param("id");
	const loan = await loanFor(c.env, loanId, member.id);
	if (!loan) return json(c, problem(404, "No such loan"));
	const direction =
		loan.status === "accepted"
			? "out"
			: loan.status === "active"
				? "back"
				: null;
	if (!direction)
		return json(
			c,
			problem(409, "Nothing to schedule", "The loan is not at a handoff stage"),
		);
	if (!meets(loan, direction, member.id)) return json(c, notYours());

	const parsed = ProposeHandoff.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid slot"));
	const { day, period } = parsed.data;

	const existing = await c.env.DB.prepare(
		"SELECT id, status FROM handoffs WHERE loan_id = ? AND direction = ? AND status IN ('proposed', 'agreed')",
	)
		.bind(loanId, direction)
		.first<{ id: string; status: string }>();
	if (existing?.status === "agreed")
		return json(c, problem(409, "Already agreed", "Cancel it first"));

	const id = ulid();
	await c.env.DB.batch([
		...(existing
			? [
					c.env.DB.prepare(
						"UPDATE handoffs SET status = 'cancelled' WHERE id = ?",
					).bind(existing.id),
				]
			: []),
		c.env.DB.prepare(
			`INSERT INTO handoffs (id, loan_id, direction, day, period, proposed_by, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)`,
		).bind(id, loanId, direction, day, period, member.id, now()),
	]);

	const counterpart = direction === "out" ? loan.giver : loan.lender;
	const other = member.id === loan.borrowerId ? counterpart : loan.borrower;
	const me = member.id === loan.borrowerId ? loan.borrower : counterpart;
	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "handoff",
			to: other.email,
			locale: other.locale,
			url: `${c.env.APP_URL}/loans/${loanId}`,
			bookTitle: loan.title,
			otherName: me.name,
			stage: "proposed",
			day,
			period,
			place: null,
			code: null,
		}).catch((error: unknown) =>
			console.error("[handoffs] notify failed", error),
		),
	);
	c.executionCtx.waitUntil(
		emit(
			c.env,
			c.executionCtx,
			"handoff.scheduled",
			{ loanId },
			{ handoffId: id, direction },
		),
	);
	return c.json({ id, status: "proposed" }, 201);
});

/** The other party agrees: the place is revealed to the borrower, the code to the lender. */
handoffs.post("/v1/loans/:id/handoff/confirm", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const loanId = c.req.param("id");
	const loan = await loanFor(c.env, loanId, member.id);
	if (!loan) return json(c, problem(404, "No such loan"));

	const proposal = await c.env.DB.prepare(
		`SELECT id, day, period, direction FROM handoffs
		  WHERE loan_id = ? AND status = 'proposed' AND proposed_by != ?`,
	)
		.bind(loanId, member.id)
		.first<{
			id: string;
			day: string;
			period: Period;
			direction: "out" | "back";
		}>();
	if (!proposal) return json(c, problem(404, "No proposal to confirm"));
	if (!meets(loan, proposal.direction, member.id)) return json(c, notYours());

	const code = handoffCode();
	// Still proposed when written, not only when read: a cancel or re-propose
	// racing the confirm must not leave a cancelled row agreed.
	const agreed = await c.env.DB.prepare(
		"UPDATE handoffs SET status = 'agreed', agreed_at = ?, code = ? WHERE id = ? AND status = 'proposed'",
	)
		.bind(now(), code, proposal.id)
		.run();
	if (!agreed.meta.changes)
		return json(c, problem(404, "No proposal to confirm"));

	// Borrower learns where; lender learns the code. The code travels only to the lender.
	const giver = proposal.direction === "out" ? loan.giver : loan.lender;
	// The email carries the note with the place: both are for the visitor.
	const meeting = await meetingPlace(c.env, giver.id);
	const place =
		[meeting.place, meeting.note].filter(Boolean).join(" · ") || null;
	const sends = [
		tell(c.env, {
			kind: "handoff",
			to: loan.borrower.email,
			locale: loan.borrower.locale,
			url: `${c.env.APP_URL}/loans/${loanId}`,
			bookTitle: loan.title,
			otherName: giver.name,
			stage: "agreed",
			day: proposal.day,
			period: proposal.period,
			place,
			code: null,
		}),
		tell(c.env, {
			kind: "handoff",
			to: giver.email,
			locale: giver.locale,
			url: `${c.env.APP_URL}/loans/${loanId}`,
			bookTitle: loan.title,
			otherName: loan.borrower.name,
			stage: "agreed",
			day: proposal.day,
			period: proposal.period,
			place: null,
			code,
		}),
	];
	c.executionCtx.waitUntil(
		Promise.all(sends).catch((error: unknown) =>
			console.error("[handoffs]", error),
		),
	);
	return c.body(null, 204);
});

handoffs.post("/v1/loans/:id/handoff/cancel", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const loanId = c.req.param("id");
	const loan = await loanFor(c.env, loanId, member.id);
	if (!loan) return json(c, problem(404, "No such loan"));
	const direction = loan.status === "accepted" ? "out" : "back";
	if (!meets(loan, direction, member.id)) return json(c, notYours());
	const result = await c.env.DB.prepare(
		"UPDATE handoffs SET status = 'cancelled' WHERE loan_id = ? AND status IN ('proposed', 'agreed')",
	)
		.bind(loanId)
		.run();
	return result.meta.changes
		? c.body(null, 204)
		: json(c, problem(404, "Nothing to cancel"));
});

/**
 * On the day: the borrower types the lender's code. Same effect as "Mark
 * handed" (or "Mark returned" on the way back), but both sides were present.
 */
handoffs.post("/v1/loans/:id/handoff/complete", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const loanId = c.req.param("id");
	const loan = await loanFor(c.env, loanId, member.id);
	if (!loan) return json(c, problem(404, "No such loan"));
	const parsed = CompleteHandoff.safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Invalid code"));

	const agreed = await c.env.DB.prepare(
		"SELECT id, direction, code FROM handoffs WHERE loan_id = ? AND status = 'agreed'",
	)
		.bind(loanId)
		.first<{
			id: string;
			direction: "out" | "back";
			code: string | null;
		}>();
	if (!agreed) return json(c, problem(404, "No agreed handoff"));
	if (!meets(loan, agreed.direction, member.id)) return json(c, notYours());
	if (loan.status !== (agreed.direction === "out" ? "accepted" : "active"))
		return json(
			c,
			problem(409, "Nothing to hand over", "The loan has moved on"),
		);
	const entered = parsed.data.code.toUpperCase().replace(/[^A-Z0-9]/g, "");
	if (entered !== agreed.code) return json(c, problem(403, "Wrong code"));

	const at = now();
	let changedCopy = "";
	// On a relay, the loan of the reader handing it on, which ends here.
	let previous: string | null = null;
	const statements = [
		c.env.DB.prepare(
			"UPDATE handoffs SET status = 'completed', completed_at = ? WHERE id = ?",
		).bind(at, agreed.id),
	];
	if (agreed.direction === "out") {
		const copy = await c.env.DB.prepare(
			`SELECT c.id, c.loan_days, co.loan_days AS community_days,
			        (SELECT p.id FROM loans p WHERE p.copy_id = c.id AND p.status = 'active'
			            AND p.of_set = 0 AND p.id != l.id) AS previous
			   FROM loans l
			   JOIN copies c ON c.id = l.copy_id JOIN communities co ON co.id = l.community_id WHERE l.id = ?`,
		)
			.bind(loanId)
			.first<{
				id: string;
				loan_days: number | null;
				community_days: number;
				previous: string | null;
			}>();
		if (!copy) return json(c, problem(404, "No such loan"));
		const days = copy.loan_days ?? copy.community_days;
		changedCopy = copy.id;
		previous = copy.previous;
		statements.push(
			// The reader before closes first: a copy has one active loan at a
			// time. Only while this loan is still the accepted one.
			c.env.DB.prepare(
				`UPDATE loans SET status = 'completed', outcome = 'relayed', closed_at = ?1
				  WHERE copy_id = ?2 AND status = 'active' AND id != ?3 AND of_set = 0
				    AND EXISTS (SELECT 1 FROM loans WHERE id = ?3 AND status = 'accepted')`,
			).bind(at, copy.id, loanId),
			c.env.DB.prepare(
				"UPDATE loans SET status = 'active', started_at = ?, due_at = ? WHERE id = ? AND status = 'accepted'",
			).bind(at, at + days * 86_400, loanId),
			c.env.DB.prepare(
				`UPDATE copies SET state = 'on_loan', holder_id = ?1 WHERE id = ?2 AND quantity = 1
				  AND EXISTS (SELECT 1 FROM loans WHERE id = ?3 AND status = 'active' AND started_at = ?4)`,
			).bind(loan.borrowerId, copy.id, loanId, at),
			dropStaleHandoffs(c.env, copy.id),
		);
	} else {
		const copy = await c.env.DB.prepare(
			"SELECT copy_id FROM loans WHERE id = ?",
		)
			.bind(loanId)
			.first<{ copy_id: string }>();
		changedCopy = copy?.copy_id ?? "";
		statements.push(
			c.env.DB.prepare(
				"UPDATE loans SET status = 'completed', outcome = 'returned', closed_at = ? WHERE id = ? AND status = 'active'",
			).bind(at, loanId),
			c.env.DB.prepare(
				`UPDATE copies SET state = ${BACK_WITH_OWNER}, holder_id = owner_id WHERE id = ?1 AND quantity = 1
				  AND EXISTS (SELECT 1 FROM loans WHERE id = ?2 AND outcome = 'returned' AND closed_at = ?3)`,
			).bind(copy?.copy_id ?? "", loanId, at),
			c.env.DB.prepare(
				`UPDATE loans SET relay_from = NULL WHERE copy_id = ?1 AND status IN ('requested', 'accepted')
				  AND EXISTS (SELECT 1 FROM loans WHERE id = ?2 AND outcome = 'returned' AND closed_at = ?3)`,
			).bind(copy?.copy_id ?? "", loanId, at),
			dropStaleHandoffs(c.env, copy?.copy_id ?? ""),
		);
	}
	const written = await c.env.DB.batch(statements);
	// The loan itself moved: the statement after the handoff's.
	const moved = agreed.direction === "out" ? written[2] : written[1];
	if (!moved?.meta.changes)
		return json(
			c,
			problem(409, "Nothing to hand over", "The loan has moved on"),
		);
	if (agreed.direction === "out" && previous && written[1]?.meta.changes)
		relayed(c, previous, at);
	if (agreed.direction === "back") {
		// Only now is the copy back on the shelf for the waitlist to find.
		c.executionCtx.waitUntil(
			c.env.CONVO.closed(loanId, at).catch(() => undefined),
		);
		c.executionCtx.waitUntil(
			onCopyAvailable(c.env, changedCopy).catch(() => undefined),
		);
	}
	c.executionCtx.waitUntil(
		emit(
			c.env,
			c.executionCtx,
			"handoff.confirmed",
			{ loanId },
			{ handoffId: agreed.id, direction: agreed.direction },
		),
	);
	if (agreed.direction === "back") {
		c.executionCtx.waitUntil(
			emit(c.env, c.executionCtx, "loan.closed", { loanId }),
		);
	}
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.state_changed", { copyId: changedCopy }),
	);
	return c.body(null, 204);
});

/** The current handoff on a loan, shaped for whoever is asking. */
handoffs.get("/v1/loans/:id/handoff", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);
	const loanId = c.req.param("id");
	const loan = await loanFor(c.env, loanId, member.id);
	if (!loan) return json(c, problem(404, "No such loan"));

	const row = await c.env.DB.prepare(
		`SELECT id, direction, day, period, status, proposed_by, agreed_at, code FROM handoffs
		  WHERE loan_id = ? AND status IN ('proposed', 'agreed') ORDER BY created_at DESC LIMIT 1`,
	)
		.bind(loanId)
		.first<{
			id: string;
			direction: "out" | "back";
			day: string;
			period: Period;
			status: "proposed" | "agreed";
			proposed_by: string;
			agreed_at: number | null;
			code: string | null;
		}>();
	if (!row) return c.json({ handoff: null });

	// The handoff happens at the host's place: the holder's on the way out,
	// the owner's on the way back. Only the borrower travels there, so only
	// the borrower sees it; only the host holds the code.
	const giverId = row.direction === "out" ? loan.giver.id : loan.lenderId;
	const iAmLender = member.id === giverId;
	const iAmVisitor = member.id === loan.borrowerId;
	const host = await meetingPlace(c.env, giverId);
	const reveal = row.status === "agreed" && iAmVisitor;
	const view: HandoffView = {
		id: row.id,
		direction: row.direction,
		day: row.day,
		period: row.period,
		status: row.status,
		proposedByMe: row.proposed_by === member.id,
		place: reveal ? host.place : null,
		note: reveal ? host.note : null,
		placeMissing: host.place === null,
		// A six-character, single-use secret scoped to one loan: kept plain so the lender can read it here.
		code: row.status === "agreed" && iAmLender ? row.code : null,
		agreedAt: row.agreed_at,
	};
	return c.json({ handoff: view });
});

/**
 * A handoff is between the two who meet: the borrower, and on the way out
 * whoever holds the copy (the reader before them on a relay, else the
 * owner), on the way back the owner. On a relay the owner is not there, so
 * cannot agree a time, or learn a place, on the holder's behalf.
 */
function meets(
	loan: { borrowerId: string; lenderId: string; giver: { id: string } },
	direction: "out" | "back",
	memberId: string,
): boolean {
	const host = direction === "out" ? loan.giver.id : loan.lenderId;
	return memberId === loan.borrowerId || memberId === host;
}

function notYours() {
	return problem(
		403,
		"Not your handoff",
		"The reader handing it on arranges this with the borrower",
	);
}

/**
 * The reader before handed the copy on: their loan is over, so its thread
 * starts towards being deleted, and those listening hear it closed.
 */
export function relayed(
	c: Context<{ Bindings: Env }>,
	previousLoanId: string,
	at: number,
) {
	c.executionCtx.waitUntil(
		c.env.CONVO.closed(previousLoanId, at).catch(() => undefined),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "loan.closed", { loanId: previousLoanId }),
	);
}

async function loanFor(env: Env, loanId: string, memberId: string) {
	const row = await env.DB.prepare(
		`SELECT l.id, l.status, l.borrower_id, l.lender_id, l.relay_from, e.title,
		        b.display_name AS b_name, b.email AS b_email, b.locale AS b_locale,
		        o.display_name AS o_name, o.email AS o_email, o.locale AS o_locale,
		        r.display_name AS r_name, r.email AS r_email, r.locale AS r_locale
		   FROM loans l
		   JOIN copies c ON c.id = l.copy_id
		   JOIN editions e ON e.id = c.edition_id
		   JOIN members b ON b.id = l.borrower_id
		   JOIN members o ON o.id = l.lender_id
		   LEFT JOIN members r ON r.id = l.relay_from
		  WHERE l.id = ? AND (l.borrower_id = ? OR l.lender_id = ?
		        OR (l.relay_from = ? AND l.status IN ('requested', 'accepted')))`,
	)
		.bind(loanId, memberId, memberId, memberId)
		.first<{
			id: string;
			status: string;
			borrower_id: string;
			lender_id: string;
			title: string;
			b_name: string;
			b_email: string;
			b_locale: "en" | "he";
			o_name: string;
			o_email: string;
			o_locale: "en" | "he";
			relay_from: string | null;
			r_name: string | null;
			r_email: string | null;
			r_locale: "en" | "he" | null;
		}>();
	if (!row) return null;
	const lender = {
		id: row.lender_id,
		name: row.o_name,
		email: row.o_email,
		locale: row.o_locale,
	};
	const holder = row.relay_from
		? {
				id: row.relay_from,
				name: row.r_name ?? "",
				email: row.r_email ?? "",
				locale: row.r_locale ?? "en",
			}
		: lender;
	return {
		id: row.id,
		status: row.status,
		title: row.title,
		borrowerId: row.borrower_id,
		lenderId: row.lender_id,
		relayFrom: row.relay_from,
		borrower: {
			id: row.borrower_id,
			name: row.b_name,
			email: row.b_email,
			locale: row.b_locale,
		},
		lender,
		/** Who hands the book over on the way out: the holder on a relay, else the owner. */
		giver: holder,
	};
}

async function meetingPlace(
	env: Env,
	memberId: string,
): Promise<{ place: string | null; note: string | null }> {
	const row = await env.DB.prepare(
		"SELECT meeting_place, meeting_note FROM members WHERE id = ?",
	)
		.bind(memberId)
		.first<{ meeting_place: string | null; meeting_note: string | null }>();
	return { place: row?.meeting_place ?? null, note: row?.meeting_note ?? null };
}

/** Six characters, no ambiguous glyphs, easy to read aloud. */
function handoffCode(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const bytes = crypto.getRandomValues(new Uint8Array(6));
	return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}
