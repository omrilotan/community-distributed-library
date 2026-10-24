import { Hono, type Context } from "hono";
import {
	ExtendLoan,
	MAX_EXTENSIONS,
	PostMessage,
	RequestLoan,
	problem,
	type LoanThread,
	type ThreadReport,
	type LoanView,
} from "@cdl/contracts";
import { BACK_WITH_OWNER, CLAIMED, OWNER_OUT } from "./sets.ts";
import type { Env } from "./env.ts";
import { dropStaleHandoffs } from "./stale-handoffs.ts";
import { tell } from "./notify.ts";
import { viewer, viewerWith, type Viewer } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { denied, json } from "./problem.ts";
import { holdOn, onCopyAvailable } from "./waitlist.ts";
import { emit } from "./events.ts";
import { relayed } from "./routes-handoffs.ts";
import { markRead, unreadByLoan } from "./unread.ts";

export const loans = new Hono<{ Bindings: Env }>();

/**
 * Ask to borrow. The copy stays on the shelf until the lender says yes; the
 * unique index on open loans makes a second request on the same copy fail
 * cleanly instead of racing.
 */
loans.post("/v1/loans", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);

	const parsed = RequestLoan.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	const { copyId, message, quantity } = parsed.data;

	const copy = await c.env.DB.prepare(
		`SELECT c.owner_id, c.state, c.lending, c.relay_allowed, c.holder_id, e.title, e.work_id,
		        c.quantity, ${CLAIMED} AS claimed,
		        m.email, m.locale, m.lend_limit, m.away_until,
		        ${OWNER_OUT} AS owner_out,
		        EXISTS (SELECT 1 FROM memberships om WHERE om.member_id = c.owner_id
		                 AND om.community_id = cs.community_id AND om.status = 'active') AS owner_active,
		        EXISTS (SELECT 1 FROM memberships hm WHERE hm.member_id = c.holder_id
		                 AND hm.community_id = cs.community_id AND hm.status = 'active') AS holder_active
		   FROM copies c
		   JOIN copy_shares cs ON cs.copy_id = c.id AND cs.community_id = ?
		   JOIN editions e ON e.id = c.edition_id
		   JOIN members m ON m.id = c.owner_id
		  WHERE c.id = ?`,
	)
		.bind(member.communityId, copyId)
		.first<{
			owner_id: string;
			state: string;
			lending: string;
			relay_allowed: number;
			holder_id: string | null;
			title: string;
			work_id: string;
			email: string;
			locale: "en" | "he";
			lend_limit: number | null;
			away_until: number | null;
			owner_out: number;
			quantity: number;
			claimed: number;
			owner_active: number;
			holder_active: number;
		}>();
	if (!copy) return json(c, problem(404, "No such copy"));
	// Suspended: nobody writes to them, so nothing is asked of them.
	if (!copy.owner_active)
		return json(
			c,
			problem(409, "Not available", "This copy cannot be requested right now"),
		);
	// Part of a set, or the whole of anything else.
	const ofSet = copy.quantity > 1;
	if (!ofSet && quantity > 1)
		return json(c, problem(422, "Not a set", "This one is lent whole"));
	if (copy.owner_id === member.id)
		return json(c, problem(409, "That is your own book"));
	if (copy.lending !== "lendable") {
		return json(
			c,
			problem(409, "Not available", "This copy cannot be requested right now"),
		);
	}
	// Away: the book is here, its owner is not, so there is nobody to meet.
	if (copy.away_until !== null && copy.away_until > now()) {
		return json(
			c,
			problem(
				409,
				"Away",
				"This member is away; their books can be asked for when they are back",
			),
		);
	}
	// The owner sets how many books they will have out at once.
	if (copy.lend_limit !== null && copy.owner_out >= copy.lend_limit) {
		return json(
			c,
			problem(
				409,
				"Lending as many as they can",
				"This member already has as many books out as they lend at once",
			),
		);
	}
	// A relay: the copy is out, the owner allows passing it on, and the holder
	// is not the asker. Never for a set: it comes back to its owner.
	const relay =
		!ofSet &&
		copy.state === "on_loan" &&
		copy.relay_allowed === 1 &&
		copy.holder_id !== member.id &&
		copy.holder_active === 1;
	if (copy.state !== "shelved" && !relay) {
		return json(
			c,
			problem(409, "Not available", "This copy cannot be requested right now"),
		);
	}
	if (ofSet) {
		const asked = await c.env.DB.prepare(
			`SELECT 1 FROM loans WHERE copy_id = ? AND borrower_id = ?
			   AND status IN ('requested', 'accepted', 'active')`,
		)
			.bind(copyId, member.id)
			.first();
		if (asked)
			return json(
				c,
				problem(409, "Already asked", "You already have some of this set"),
			);
		const free = copy.quantity - copy.claimed;
		if (quantity > free)
			return json(
				c,
				problem(
					409,
					"Not that many free",
					free > 0 ? `${free} of ${copy.quantity} are free` : "None are free",
				),
			);
	}
	// First dibs: someone on the waitlist may be holding this copy. Never a
	// set: part of one is never held, so the rest stays free to ask for.
	const hold = ofSet ? null : await holdOn(c.env, copyId);
	if (hold && hold.member_id !== member.id) {
		return json(
			c,
			problem(
				409,
				"On hold",
				"A member on the waitlist has first dibs on this copy",
			),
		);
	}

	const id = ulid();
	if (ofSet) {
		// Asked and counted in one statement, so two neighbours asking at once
		// cannot take more of the set than there is; and one open loan of it
		// per member, kept by the database when a form is sent twice.
		const result = await c.env.DB.prepare(
			`INSERT INTO loans (id, copy_id, borrower_id, lender_id, community_id, status, message, requested_at, quantity, of_set)
			 SELECT ?1, ?2, ?3, ?4, ?5, 'requested', ?6, ?7, ?8, 1
			  WHERE (SELECT quantity FROM copies WHERE id = ?2)
			        - (SELECT coalesce(sum(quantity), 0) FROM loans
			            WHERE copy_id = ?2 AND status IN ('requested', 'accepted', 'active')) >= ?8`,
		)
			.bind(
				id,
				copyId,
				member.id,
				copy.owner_id,
				member.communityId,
				message ?? null,
				now(),
				quantity,
			)
			.run()
			.catch((error: unknown) => {
				if (String(error).includes("UNIQUE")) return null;
				throw error;
			});
		if (!result)
			return json(
				c,
				problem(409, "Already asked", "You already have some of this set"),
			);
		if (!result.meta.changes)
			return json(
				c,
				problem(409, "Not that many free", "Someone asked just before you"),
			);
	} else
		try {
			await c.env.DB.prepare(
				`INSERT INTO loans (id, copy_id, borrower_id, lender_id, community_id, status, message, requested_at, relay_from, previous_loan_id)
			 VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, (SELECT id FROM loans WHERE copy_id = ? AND status = 'active' AND of_set = 0))`,
			)
				.bind(
					id,
					copyId,
					member.id,
					copy.owner_id,
					member.communityId,
					message ?? null,
					now(),
					relay ? copy.holder_id : null,
					copyId,
				)
				.run();
		} catch (error) {
			if (String(error).includes("UNIQUE")) {
				return json(
					c,
					problem(
						409,
						"Already requested",
						"Someone has an open request on this copy",
					),
				);
			}
			throw error;
		}

	// Asked for at last: whatever the asker was waiting in the queue for this
	// work for, a hold or a place, is spent.
	await c.env.DB.prepare(
		"DELETE FROM waitlist WHERE member_id = ? AND work_id = ? AND community_id = ?",
	)
		.bind(member.id, copy.work_id, member.communityId)
		.run();

	const borrower = await displayName(c.env, member.id);
	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "loan_request",
			to: copy.email,
			locale: copy.locale,
			url: `${c.env.APP_URL}/loans`,
			bookTitle: copy.title,
			borrowerName: borrower,
			note: message ?? null,
			relay,
		}).catch((error: unknown) => console.error("[loans] notify failed", error)),
	);

	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "loan.requested", { loanId: id }),
	);
	return c.json({ id, status: "requested", relay }, 201);
});

/** Lender's answer. Accepting reserves the copy; declining leaves it on the shelf. */
loans.post("/v1/loans/:id/accept", (c) => decide(c, true));
loans.post("/v1/loans/:id/decline", (c) => decide(c, false));

async function decide(c: Context<{ Bindings: Env }>, accept: boolean) {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id") ?? "";

	const loan = await c.env.DB.prepare(
		`SELECT l.copy_id, l.borrower_id, e.title, m.email, m.locale
		   FROM loans l
		   JOIN copies c ON c.id = l.copy_id
		   JOIN editions e ON e.id = c.edition_id
		   JOIN members m ON m.id = l.borrower_id
		  WHERE l.id = ? AND l.lender_id = ? AND l.status = 'requested'`,
	)
		.bind(id, member.id)
		.first<{
			copy_id: string;
			borrower_id: string;
			title: string;
			email: string;
			locale: "en" | "he";
		}>();
	if (!loan) return json(c, problem(404, "No open request"));

	const at = now();
	const [decided] = await c.env.DB.batch([
		// Still a request when written, not only when read: a decline racing an
		// accept, or the borrower cancelling, wins or loses cleanly.
		c.env.DB.prepare(
			"UPDATE loans SET status = ?, decided_at = ? WHERE id = ? AND status = 'requested'",
		).bind(accept ? "accepted" : "declined", at, id),
		...(accept
			? [
					c.env.DB.prepare(
						// A set stays on its owner's shelf while parts of it are out.
						`UPDATE copies SET state = 'reserved' WHERE id = ?1 AND state = 'shelved' AND quantity = 1
						   AND EXISTS (SELECT 1 FROM loans WHERE id = ?2 AND status = 'accepted' AND decided_at = ?3)`,
					).bind(loan.copy_id, id, at),
				]
			: []),
		dropStaleHandoffs(c.env, loan.copy_id),
	]);
	if (!decided?.meta.changes) return json(c, movedOn());
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, accept ? "loan.accepted" : "loan.closed", {
			loanId: id,
		}),
	);
	if (accept) {
		c.executionCtx.waitUntil(
			emit(c.env, c.executionCtx, "copy.state_changed", {
				copyId: loan.copy_id,
			}),
		);
	} else {
		c.executionCtx.waitUntil(
			c.env.CONVO.closed(id, now()).catch(() => undefined),
		);
		c.executionCtx.waitUntil(
			onCopyAvailable(c.env, loan.copy_id).catch(() => undefined),
		);
	}

	const lender = await displayName(c.env, member.id);
	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "loan_decision",
			to: loan.email,
			locale: loan.locale,
			url: `${c.env.APP_URL}/loans`,
			bookTitle: loan.title,
			lenderName: lender,
			accepted: accept,
		}).catch((error: unknown) => console.error("[loans] notify failed", error)),
	);
	return c.body(null, 204);
}

/** Either side may cancel before the handoff; an accepted loan frees the copy again. */
loans.post("/v1/loans/:id/cancel", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");

	const loan = await c.env.DB.prepare(
		`SELECT copy_id, status FROM loans
		  WHERE id = ? AND (borrower_id = ? OR lender_id = ?) AND status IN ('requested', 'accepted')`,
	)
		.bind(id, member.id, member.id)
		.first<{ copy_id: string; status: string }>();
	if (!loan) return json(c, problem(404, "Nothing to cancel"));

	const at = now();
	const [cancelled] = await c.env.DB.batch([
		c.env.DB.prepare(
			"UPDATE loans SET status = 'cancelled', outcome = 'cancelled', closed_at = ? WHERE id = ? AND status IN ('requested', 'accepted')",
		).bind(at, id),
		c.env.DB.prepare(
			`UPDATE copies SET state = 'shelved' WHERE id = ?1 AND state = 'reserved'
			   AND EXISTS (SELECT 1 FROM loans WHERE id = ?2 AND status = 'cancelled' AND closed_at = ?3)`,
		).bind(loan.copy_id, id, at),
		dropStaleHandoffs(c.env, loan.copy_id),
	]);
	if (!cancelled?.meta.changes) return json(c, movedOn());
	c.executionCtx.waitUntil(c.env.CONVO.closed(id, at).catch(() => undefined));
	c.executionCtx.waitUntil(
		onCopyAvailable(c.env, loan.copy_id).catch(() => undefined),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "loan.closed", { loanId: id }),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.state_changed", { copyId: loan.copy_id }),
	);
	return c.body(null, 204);
});

const NUDGE_COOLDOWN = 24 * 3600;

/**
 * The book changed hands. Either party may say so; custody and the clock
 * move together. Two-sided code confirmation arrives with M3 scheduling.
 */
loans.post("/v1/loans/:id/handed", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");

	const loan = await c.env.DB.prepare(
		`SELECT l.copy_id, l.borrower_id, c.loan_days, co.loan_days AS community_days,
		        (SELECT p.id FROM loans p WHERE p.copy_id = l.copy_id AND p.status = 'active'
		            AND p.of_set = 0 AND p.id != l.id) AS previous
		   FROM loans l
		   JOIN copies c ON c.id = l.copy_id
		   JOIN communities co ON co.id = l.community_id
		  WHERE l.id = ? AND (l.borrower_id = ? OR l.lender_id = ? OR l.relay_from = ?) AND l.status = 'accepted'`,
	)
		.bind(id, member.id, member.id, member.id)
		.first<{
			copy_id: string;
			borrower_id: string;
			loan_days: number | null;
			community_days: number;
			previous: string | null;
		}>();
	if (!loan) return json(c, problem(404, "Nothing to hand over"));

	const days = loan.loan_days ?? loan.community_days;
	const at = now();
	const [relay, started] = await c.env.DB.batch([
		// A relay closes the previous loan as "relayed" in the same breath, and
		// first: a copy has one active loan at a time.
		c.env.DB.prepare(
			`UPDATE loans SET status = 'completed', outcome = 'relayed', closed_at = ?1
			  WHERE copy_id = ?2 AND status = 'active' AND id != ?3 AND of_set = 0
			    AND EXISTS (SELECT 1 FROM loans WHERE id = ?3 AND status = 'accepted')`,
		).bind(at, loan.copy_id, id),
		c.env.DB.prepare(
			"UPDATE loans SET status = 'active', started_at = ?, due_at = ? WHERE id = ? AND status = 'accepted'",
		).bind(at, at + days * 86_400, id),
		c.env.DB.prepare(
			`UPDATE copies SET state = 'on_loan', holder_id = ?1 WHERE id = ?2 AND quantity = 1
			   AND EXISTS (SELECT 1 FROM loans WHERE id = ?3 AND status = 'active' AND started_at = ?4)`,
		).bind(loan.borrower_id, loan.copy_id, id, at),
		dropStaleHandoffs(c.env, loan.copy_id),
	]);
	if (!started?.meta.changes) return json(c, movedOn());
	if (loan.previous && relay?.meta.changes) relayed(c, loan.previous, at);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.state_changed", { copyId: loan.copy_id }),
	);
	return c.body(null, 204);
});

/** The book is back with its owner. Closes the loan and reopens the shelf slot. */
loans.post("/v1/loans/:id/returned", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");

	const loan = await c.env.DB.prepare(
		`SELECT copy_id, lender_id FROM loans
		  WHERE id = ? AND (borrower_id = ? OR lender_id = ?) AND status = 'active'`,
	)
		.bind(id, member.id, member.id)
		.first<{ copy_id: string; lender_id: string }>();
	if (!loan) return json(c, problem(404, "Nothing to return"));

	const at = now();
	const returnedNow = `EXISTS (SELECT 1 FROM loans WHERE id = ?2 AND outcome = 'returned' AND closed_at = ?3)`;
	const [returned] = await c.env.DB.batch([
		c.env.DB.prepare(
			"UPDATE loans SET status = 'completed', outcome = 'returned', closed_at = ? WHERE id = ? AND status = 'active'",
		).bind(at, id),
		c.env.DB.prepare(
			`UPDATE copies SET state = ${BACK_WITH_OWNER}, holder_id = owner_id WHERE id = ?1 AND quantity = 1 AND ${returnedNow}`,
		).bind(loan.copy_id, id, at),
		// A pending relay on this copy is now an ordinary request from the owner.
		c.env.DB.prepare(
			`UPDATE loans SET relay_from = NULL WHERE copy_id = ?1 AND status IN ('requested', 'accepted') AND ${returnedNow}`,
		).bind(loan.copy_id, id, at),
		dropStaleHandoffs(c.env, loan.copy_id),
	]);
	if (!returned?.meta.changes) return json(c, movedOn());
	c.executionCtx.waitUntil(c.env.CONVO.closed(id, at).catch(() => undefined));
	c.executionCtx.waitUntil(
		onCopyAvailable(c.env, loan.copy_id).catch(() => undefined),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "loan.closed", { loanId: id }),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.state_changed", { copyId: loan.copy_id }),
	);
	return c.body(null, 204);
});

/**
 * Push the due date back. The borrower may do it alone when nobody is waiting
 * for the work; the owner may always. Two extensions per loan.
 */
loans.post("/v1/loans/:id/extend", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");
	const parsed = ExtendLoan.safeParse(
		(await c.req.json().catch(() => null)) ?? {},
	);
	if (!parsed.success) return json(c, problem(422, "Invalid extension"));

	const loan = await c.env.DB.prepare(
		`SELECT l.borrower_id, l.lender_id, l.due_at, l.extensions, l.community_id, e.work_id
		   FROM loans l JOIN copies c ON c.id = l.copy_id JOIN editions e ON e.id = c.edition_id
		  WHERE l.id = ? AND (l.borrower_id = ? OR l.lender_id = ?) AND l.status = 'active'`,
	)
		.bind(id, member.id, member.id)
		.first<{
			borrower_id: string;
			lender_id: string;
			due_at: number;
			extensions: number;
			community_id: string;
			work_id: string;
		}>();
	if (!loan) return json(c, problem(404, "No active loan"));
	if (loan.extensions >= MAX_EXTENSIONS)
		return json(
			c,
			problem(409, "No more extensions", "Ask the owner directly"),
		);

	if (member.id === loan.borrower_id) {
		const waiting = await c.env.DB.prepare(
			"SELECT 1 FROM waitlist WHERE work_id = ? AND community_id = ? AND member_id != ? LIMIT 1",
		)
			.bind(loan.work_id, loan.community_id, member.id)
			.first();
		if (waiting)
			return json(
				c,
				problem(409, "Someone is waiting", "Ask the owner to extend"),
			);
	}

	const base = Math.max(loan.due_at, now());
	// Counted as read: a form sent twice extends once.
	const extended = await c.env.DB.prepare(
		`UPDATE loans SET due_at = ?, extensions = extensions + 1,
		        reminded_due_at = NULL, reminded_overdue_at = NULL, escalated_at = NULL
		  WHERE id = ? AND status = 'active' AND extensions = ?`,
	)
		.bind(base + parsed.data.days * 86_400, id, loan.extensions)
		.run();
	if (!extended.meta.changes) return json(c, movedOn());
	return c.body(null, 204);
});

/** A reminder to the other side, once a day per side, worded by the loan's stage. */
loans.post("/v1/loans/:id/nudge", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");
	const party = await participants(c.env, id, member.id);
	if (!party || !party.open) return json(c, problem(404, "No open loan"));
	if (counterpart(party, member.id).suspended)
		return json(c, suspendedProblem());

	const iAmBorrower = member.id === party.borrower.id;
	// Each side has a nudge a day; on a relay the reader handing it on too.
	const iAmRelay = member.id === party.relay?.id;
	const column = iAmBorrower
		? "borrower_nudged_at"
		: iAmRelay
			? "relay_nudged_at"
			: "lender_nudged_at";
	const row = await c.env.DB.prepare(
		`SELECT status, due_at, ${column} AS last FROM loans WHERE id = ?`,
	)
		.bind(id)
		.first<{ status: string; due_at: number | null; last: number | null }>();
	if (!row) return json(c, problem(404, "No open loan"));
	const at = now();
	if (row.last && at - row.last < NUDGE_COOLDOWN) {
		return json(
			c,
			problem(429, "Already nudged today", "One nudge a day is plenty"),
		);
	}

	const stage =
		row.status === "requested"
			? "answer"
			: row.status === "accepted"
				? "handoff"
				: row.due_at && at > row.due_at
					? "overdue"
					: "due";
	const days = row.due_at ? Math.ceil(Math.abs(row.due_at - at) / 86_400) : 0;

	// Counted as written: two taps in the same second nudge once.
	const nudged = await c.env.DB.prepare(
		`UPDATE loans SET ${column} = ?1
		  WHERE id = ?2 AND (${column} IS NULL OR ${column} <= ?3)`,
	)
		.bind(at, id, at - NUDGE_COOLDOWN)
		.run();
	if (!nudged.meta.changes)
		return json(
			c,
			problem(429, "Already nudged today", "One nudge a day is plenty"),
		);
	const other = counterpart(party, member.id);
	const me = iAmBorrower
		? party.borrower
		: iAmRelay
			? party.relay!
			: party.lender;
	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "loan_nudge",
			to: other.email,
			locale: other.locale,
			url: `${c.env.APP_URL}/loans/${id}`,
			bookTitle: party.title,
			fromName: me.name,
			stage,
			days,
		}).catch((error: unknown) => console.error("[loans] notify failed", error)),
	);
	return c.body(null, 204);
});

/**
 * The loan's thread. Only the two parties can read or write; core resolves
 * who they are and lets `convo` keep the words (decision 0004).
 */
loans.get("/v1/loans/:id/messages", async (c) => {
	const { member, forbidden } = await viewerWith(c, "messages:read");
	if (!member) return denied(c, forbidden);
	const party = await participants(c.env, c.req.param("id"), member.id);
	if (!party) return json(c, problem(404, "No such loan"));

	const [messages, , reports] = await Promise.all([
		c.env.CONVO.thread(party.loanId),
		// Reading the thread is what marks the loan read.
		markRead(c.env, member.id, party.loanId),
		// A report is between its author and the moderators: the member it is
		// about sees nothing of it here.
		loanReports(c.env, party.loanId, member.id),
	]);
	const thread: LoanThread = {
		loanId: party.loanId,
		viewerId: member.id,
		participants: {
			[party.borrower.id]: party.borrower.name,
			[party.lender.id]: party.lender.name,
		},
		messages,
		reports,
		open: party.open,
	};
	return c.json(thread);
});

loans.post("/v1/loans/:id/messages", async (c) => {
	const { member, forbidden } = await viewerWith(c, "messages:write");
	if (!member) return denied(c, forbidden);
	const party = await participants(c.env, c.req.param("id"), member.id);
	if (!party) return json(c, problem(404, "No such loan"));
	if (!party.open)
		return json(c, problem(409, "Loan closed", "This conversation is over"));

	const parsed = PostMessage.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Empty message"));
	if (counterpart(party, member.id).suspended)
		return json(c, suspendedProblem());

	const message = await c.env.CONVO.post(
		party.loanId,
		member.id,
		parsed.data.body,
		member.client,
	);
	// On a relay the borrower is writing to the reader handing it on.
	const other = counterpart(party, member.id);
	// Named as who wrote it: on a relay that can be the reader handing it on.
	const me =
		member.id === party.borrower.id
			? party.borrower
			: member.id === party.lender.id
				? party.lender
				: (party.relay ?? party.lender);
	c.executionCtx.waitUntil(
		tell(c.env, {
			kind: "loan_message",
			to: other.email,
			locale: other.locale,
			url: `${c.env.APP_URL}/loans/${party.loanId}`,
			bookTitle: party.title,
			fromName: me.name,
			body: message.body,
		}).catch((error: unknown) => console.error("[loans] notify failed", error)),
	);
	return c.json(message, 201);
});

interface Party {
	id: string;
	name: string;
	email: string;
	locale: "en" | "he";
	/** Suspended by the moderators: the loan goes on, but nobody writes to them. */
	suspended: boolean;
}

/**
 * Who the caller deals with on a loan: the borrower deals with whoever hands
 * the book over (the reader before them on a relay, else the owner); the
 * owner and that reader deal with the borrower.
 */
function counterpart(
	party: {
		borrower: Party;
		lender: Party;
		relay: Party | null;
		status: string;
	},
	memberId: string,
): Party {
	if (memberId !== party.borrower.id) return party.borrower;
	const handingOver = ["requested", "accepted"].includes(party.status);
	return (handingOver && party.relay) || party.lender;
}

/** Two answers crossed: the loan changed between reading and writing it. */
function movedOn() {
	return problem(409, "The loan has moved on", "Someone changed it just now");
}

/** Nobody writes to a suspended member; the moderators take it from here. */
function suspendedProblem() {
	return problem(
		409,
		"Member suspended",
		"This member is suspended. Tell the moderators about the loan instead.",
	);
}

/**
 * The loan, if the caller is one of its parties: borrower, lender, or on a
 * relay the reader handing the book on, who has the handoff to arrange.
 */
async function participants(env: Env, loanId: string, memberId: string) {
	const row = await env.DB.prepare(
		`SELECT l.id, l.status, e.title,
		        b.id AS b_id, b.display_name AS b_name, b.email AS b_email, b.locale AS b_locale,
		        o.id AS o_id, o.display_name AS o_name, o.email AS o_email, o.locale AS o_locale,
		        r.id AS r_id, r.display_name AS r_name, r.email AS r_email, r.locale AS r_locale,
		        EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = b.id AND ms.community_id = l.community_id AND ms.status = 'suspended') AS b_suspended, EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = o.id AND ms.community_id = l.community_id AND ms.status = 'suspended') AS o_suspended, EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = r.id AND ms.community_id = l.community_id AND ms.status = 'suspended') AS r_suspended
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
			title: string;
			b_id: string;
			b_name: string;
			b_email: string;
			b_locale: "en" | "he";
			o_id: string;
			o_name: string;
			o_email: string;
			o_locale: "en" | "he";
			r_id: string | null;
			r_name: string | null;
			r_email: string | null;
			r_locale: "en" | "he" | null;
			b_suspended: number;
			o_suspended: number;
			r_suspended: number;
		}>();
	if (!row) return null;
	const borrower: Party = {
		id: row.b_id,
		name: row.b_name,
		email: row.b_email,
		locale: row.b_locale,
		suspended: row.b_suspended === 1,
	};
	const lender: Party = {
		id: row.o_id,
		name: row.o_name,
		email: row.o_email,
		locale: row.o_locale,
		suspended: row.o_suspended === 1,
	};
	const relay: Party | null = row.r_id
		? {
				id: row.r_id,
				name: row.r_name ?? "",
				email: row.r_email ?? "",
				locale: row.r_locale ?? "en",
				suspended: row.r_suspended === 1,
			}
		: null;
	return {
		loanId: row.id,
		title: row.title,
		borrower,
		lender,
		relay,
		status: row.status,
		open: ["requested", "accepted", "active"].includes(row.status),
	};
}

loans.get("/v1/me/loans", async (c) => {
	const { member, forbidden } = await viewerWith(c, "loans:read");
	if (!member) return denied(c, forbidden);

	const [{ results }, unread] = await Promise.all([
		c.env.DB.prepare(
			`SELECT l.id, l.status, l.message, l.requested_at, l.decided_at, l.started_at, l.due_at, l.closed_at,
		        l.borrower_nudged_at, l.lender_nudged_at, l.relay_nudged_at, l.extensions,
		        l.quantity, c.quantity AS copy_quantity,
		        (SELECT count(*) FROM waitlist w WHERE w.work_id = e.work_id AND w.community_id = l.community_id
		           AND w.member_id != l.borrower_id) AS waiting,
		        (l.status = 'accepted' AND l.decided_at < unixepoch() - 86400
		         AND NOT EXISTS (SELECT 1 FROM handoffs h WHERE h.loan_id = l.id
		                           AND h.status IN ('proposed', 'agreed'))) AS needs_time,
		        c.id AS copy_id, c.condition, e.work_id, e.title, e.cover_url, w.authors,
		        b.id AS borrower_id, b.display_name AS borrower_name, b.area_label AS borrower_area,
		        o.id AS lender_id, o.display_name AS lender_name, o.area_label AS lender_area,
		        r.id AS relay_id, r.display_name AS relay_name,
		        EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = b.id AND ms.community_id = l.community_id AND ms.status = 'suspended') AS borrower_suspended,
		        EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = o.id AND ms.community_id = l.community_id AND ms.status = 'suspended') AS lender_suspended,
		        EXISTS (SELECT 1 FROM memberships ms WHERE ms.member_id = r.id AND ms.community_id = l.community_id AND ms.status = 'suspended') AS relay_suspended
		   FROM loans l
		   JOIN copies c ON c.id = l.copy_id
		   JOIN editions e ON e.id = c.edition_id
		   JOIN works w ON w.id = e.work_id
		   JOIN members b ON b.id = l.borrower_id
		   JOIN members o ON o.id = l.lender_id
		   LEFT JOIN members r ON r.id = l.relay_from
		  WHERE (l.borrower_id = ? OR l.lender_id = ?
		         OR (l.relay_from = ? AND l.status IN ('requested', 'accepted')))
		    AND (l.status IN ('requested', 'accepted', 'active') OR l.closed_at > ? OR l.decided_at > ?)
		  ORDER BY l.requested_at DESC`,
		)
			.bind(
				member.id,
				member.id,
				member.id,
				now() - 30 * 86_400,
				now() - 30 * 86_400,
			)
			.all<LoanRow>(),
		unreadByLoan(c.env, member.id),
	]);
	const views = results.map((row) => ({
		...view(row, member.id),
		unread: unread[row.id] ?? 0,
	}));
	return c.json({
		borrowing: views.filter((loan) => loan.borrower.id === member.id),
		lending: views.filter((loan) => loan.lender.id === member.id),
		relaying: views.filter((loan) => loan.relayFrom?.id === member.id),
	});
});

async function displayName(env: Env, memberId: string): Promise<string> {
	const row = await env.DB.prepare(
		"SELECT display_name FROM members WHERE id = ?",
	)
		.bind(memberId)
		.first<{ display_name: string }>();
	return row?.display_name ?? "";
}

function view(row: LoanRow, viewerId: string): LoanView {
	const mine =
		viewerId === row.borrower_id
			? row.borrower_nudged_at
			: viewerId === row.relay_id
				? row.relay_nudged_at
				: row.lender_nudged_at;
	const cooldown = mine ? Math.max(0, mine + NUDGE_COOLDOWN - now()) : 0;
	return {
		id: row.id,
		// Filled in by the listing, which counts for all the loans at once.
		unread: 0,
		status: row.status,
		message: row.message,
		requestedAt: row.requested_at,
		decidedAt: row.decided_at,
		startedAt: row.started_at,
		dueAt: row.due_at,
		closedAt: row.closed_at,
		quantity: row.quantity,
		nudgeCooldown: cooldown,
		extensions: row.extensions,
		someoneWaiting: row.waiting > 0,
		// Only the two who meet: on a relay that is the holder, not the owner.
		needsTime:
			row.needs_time === 1 &&
			(viewerId === row.borrower_id ||
				viewerId === (row.relay_id ?? row.lender_id)),
		copy: {
			id: row.copy_id,
			workId: row.work_id,
			title: row.title,
			authors: JSON.parse(row.authors) as string[],
			coverUrl: row.cover_url,
			condition: row.condition,
			quantity: row.copy_quantity,
		},
		borrower: {
			id: row.borrower_id,
			displayName: row.borrower_name,
			areaLabel: row.borrower_area,
			suspended: row.borrower_suspended === 1,
		},
		lender: {
			id: row.lender_id,
			displayName: row.lender_name,
			areaLabel: row.lender_area,
			suspended: row.lender_suspended === 1,
		},
		relayFrom: row.relay_id
			? {
					id: row.relay_id,
					displayName: row.relay_name ?? "",
					suspended: row.relay_suspended === 1,
				}
			: null,
	};
}

interface LoanRow {
	id: string;
	status: LoanView["status"];
	message: string | null;
	requested_at: number;
	decided_at: number | null;
	started_at: number | null;
	due_at: number | null;
	closed_at: number | null;
	borrower_nudged_at: number | null;
	lender_nudged_at: number | null;
	relay_nudged_at: number | null;
	extensions: number;
	quantity: number;
	copy_quantity: number;
	waiting: number;
	needs_time: number;
	copy_id: string;
	work_id: string;
	condition: LoanView["copy"]["condition"];
	title: string;
	cover_url: string | null;
	authors: string;
	borrower_id: string;
	borrower_name: string;
	borrower_area: string | null;
	lender_id: string;
	lender_name: string;
	lender_area: string | null;
	relay_id: string | null;
	relay_name: string | null;
	borrower_suspended: number;
	lender_suspended: number;
	relay_suspended: number;
}

/**
 * Reports on a loan, oldest first, with what became of them and the replies
 * between the reporter and the moderators. Given a reporter, only their own,
 * as they see them: a moderator's reply is from "the moderators", unnamed.
 */
export async function loanReports(
	env: Env,
	loanId: string,
	reporterId?: string,
): Promise<ThreadReport[]> {
	const { results } = await env.DB.prepare(
		`SELECT id, kind, body, reporter_id, created_at, status, resolution, closed_at
		   FROM reports
		  WHERE loan_id = ?1 AND (?2 IS NULL OR reporter_id = ?2)
		  ORDER BY created_at`,
	)
		.bind(loanId, reporterId ?? null)
		.all<{
			id: string;
			kind: ThreadReport["kind"];
			body: string | null;
			reporter_id: string;
			created_at: number;
			status: ThreadReport["status"];
			resolution: string | null;
			closed_at: number | null;
		}>();
	if (results.length === 0) return [];
	const replies = await env.DB.prepare(
		`SELECT r.id, r.report_id, r.from_moderators, r.body, r.created_at, m.display_name
		   FROM report_replies r JOIN members m ON m.id = r.author_id
		  WHERE r.report_id IN (${results.map(() => "?").join(", ")})
		  ORDER BY r.created_at`,
	)
		.bind(...results.map((row) => row.id))
		.all<{
			id: string;
			report_id: string;
			from_moderators: number;
			body: string;
			created_at: number;
			display_name: string;
		}>();
	return results.map((row) => ({
		id: row.id,
		kind: row.kind,
		body: row.body,
		reporterId: row.reporter_id,
		createdAt: row.created_at,
		status: row.status,
		resolution: row.resolution,
		closedAt: row.closed_at,
		replies: replies.results
			.filter((reply) => reply.report_id === row.id)
			.map((reply) => ({
				id: reply.id,
				fromModerators: reply.from_moderators === 1,
				authorName:
					reporterId && reply.from_moderators === 1 ? null : reply.display_name,
				body: reply.body,
				createdAt: reply.created_at,
			})),
	}));
}
