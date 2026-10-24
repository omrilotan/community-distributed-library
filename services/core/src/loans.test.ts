import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { expireHolds, onCopyAvailable } from "./waitlist.ts";
import {
	activeLoan,
	api,
	as,
	COPY_A,
	COPY_B,
	DANA,
	NOA,
	SAM,
	WORK,
} from "../test/api.ts";

/** When core told convo the loan's thread was closed. */
const closedAt = (loanId: string) =>
	(
		env.CONVO as unknown as { closedAt(id: string): Promise<number | null> }
	).closedAt(loanId);

const copyState = async (id: string) =>
	(await env.DB.prepare("SELECT state, holder_id FROM copies WHERE id = ?")
		.bind(id)
		.first())!;

describe("loan lifecycle", () => {
	it("request → accept → handed → returned moves the copy and closes the loan", async () => {
		const requested = await as(SAM).post("/v1/loans", {
			copyId: COPY_B,
			message: "please",
		});
		expect(requested.status).toBe(201);
		expect(requested.body.relay).toBe(false);
		const id = requested.body.id;

		expect((await as(DANA).post(`/v1/loans/${id}/accept`)).status).toBe(204);
		expect((await copyState(COPY_B)).state).toBe("reserved");

		expect((await as(DANA).post(`/v1/loans/${id}/handed`)).status).toBe(204);
		expect(await copyState(COPY_B)).toMatchObject({
			state: "on_loan",
			holder_id: SAM,
		});

		const mine = await as(SAM).get("/v1/me/loans");
		const loan = mine.body.borrowing.find((l: any) => l.id === id);
		expect(loan.status).toBe("active");
		expect(loan.extensions).toBe(0);
		expect(loan.someoneWaiting).toBe(false);

		expect((await as(DANA).post(`/v1/loans/${id}/returned`)).status).toBe(204);
		expect(await copyState(COPY_B)).toMatchObject({
			state: "shelved",
			holder_id: DANA,
		});
	});

	it("only one pending request per copy; a second borrower gets 409", async () => {
		expect((await as(SAM).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			201,
		);
		expect((await as(NOA).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			409,
		);
	});

	it("a stranger cannot accept", async () => {
		const { body } = await as(SAM).post("/v1/loans", { copyId: COPY_B });
		expect((await as(NOA).post(`/v1/loans/${body.id}/accept`)).status).toBe(
			404,
		);
	});

	it("a bystander can neither read nor move somebody else's loan", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		await as(SAM).post(`/v1/loans/${id}/messages`, { body: "Thanks!" });
		const before = await env.DB.prepare(
			"SELECT status, due_at, extensions FROM loans WHERE id = ?",
		)
			.bind(id)
			.first();
		// Each with a body it would take from a party, so only who is asking is wrong.
		const attempts: [method: string, path: string, body?: unknown][] = [
			["POST", "accept"],
			["POST", "decline"],
			["POST", "cancel"],
			["POST", "handed"],
			["POST", "returned"],
			["POST", "extend", { days: 7 }],
			["POST", "nudge"],
			["GET", "messages"],
			["POST", "messages", { body: "Hello from nowhere" }],
			["GET", "slots"],
			["GET", "handoff"],
			["POST", "handoff/propose", { day: "2099-01-01", period: "evening" }],
			["POST", "handoff/confirm"],
			["POST", "handoff/cancel"],
			["POST", "handoff/complete", { code: "123456" }],
			["POST", "report", { kind: "conduct", body: "Not mine to say" }],
		];
		for (const [method, path, body] of attempts) {
			const answer = await api(
				{ member: NOA },
				method,
				`/v1/loans/${id}/${path}`,
				method === "POST" ? (body ?? {}) : undefined,
			);
			expect([403, 404], `${method} ${path}`).toContain(answer.status);
		}
		expect(
			await env.DB.prepare(
				"SELECT status, due_at, extensions FROM loans WHERE id = ?",
			)
				.bind(id)
				.first(),
		).toEqual(before);
		const thread = await as(SAM).get(`/v1/loans/${id}/messages`);
		expect(
			thread.body.messages.map((message: { body: string }) => message.body),
		).toEqual(["Thanks!"]);
		expect(
			(
				await env.DB.prepare(
					"SELECT count(*) AS n FROM reports WHERE loan_id = ?",
				)
					.bind(id)
					.first<{ n: number }>()
			)?.n,
		).toBe(0);
	});

	it("a declined request closes, and the book is free to ask for again", async () => {
		const { body } = await as(SAM).post("/v1/loans", { copyId: COPY_B });
		// Only the lender declines; the borrower withdraws instead.
		expect((await as(SAM).post(`/v1/loans/${body.id}/decline`)).status).toBe(
			404,
		);
		expect((await as(DANA).post(`/v1/loans/${body.id}/decline`)).status).toBe(
			204,
		);
		expect(
			await env.DB.prepare("SELECT status FROM loans WHERE id = ?")
				.bind(body.id)
				.first(),
		).toEqual({ status: "declined" });
		expect(await copyState(COPY_B)).toMatchObject({
			state: "shelved",
			holder_id: DANA,
		});
		expect(await closedAt(body.id)).not.toBeNull();
		// Said once: a second answer finds nothing to decide.
		expect((await as(DANA).post(`/v1/loans/${body.id}/accept`)).status).toBe(
			404,
		);
		expect((await as(NOA).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			201,
		);
	});
});

describe("extensions", () => {
	it("borrower extends twice alone, then is refused", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const before = (await as(SAM).get("/v1/me/loans")).body.borrowing[0].dueAt;

		expect((await as(SAM).post(`/v1/loans/${id}/extend`, {})).status).toBe(204);
		const after = (await as(SAM).get("/v1/me/loans")).body.borrowing[0];
		expect(after.dueAt - before).toBe(7 * 86_400);
		expect(after.extensions).toBe(1);

		expect(
			(await as(SAM).post(`/v1/loans/${id}/extend`, { days: 3 })).status,
		).toBe(204);
		const third = await as(SAM).post(`/v1/loans/${id}/extend`, {});
		expect(third.status).toBe(409);
		expect(third.body.title).toBe("No more extensions");
	});

	it("borrower is blocked while someone waits; the owner is not", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		expect((await as(NOA).post("/v1/waitlist", { workId: WORK })).status).toBe(
			201,
		);

		const blocked = await as(SAM).post(`/v1/loans/${id}/extend`, {});
		expect(blocked.status).toBe(409);
		expect(blocked.body.title).toBe("Someone is waiting");
		expect(
			(await as(SAM).get("/v1/me/loans")).body.borrowing[0].someoneWaiting,
		).toBe(true);

		expect((await as(DANA).post(`/v1/loans/${id}/extend`, {})).status).toBe(
			204,
		);
	});
});

describe("relays and waitlist", () => {
	it("a copy with relays on passes straight to the next reader", async () => {
		const first = await activeLoan(SAM, DANA, COPY_A);
		const relay = await as(NOA).post("/v1/loans", { copyId: COPY_A });
		expect(relay.status).toBe(201);
		expect(relay.body.relay).toBe(true);

		expect(
			(await as(DANA).post(`/v1/loans/${relay.body.id}/accept`)).status,
		).toBe(204);
		// The holder, not the owner, hands it over.
		expect(
			(await as(SAM).post(`/v1/loans/${relay.body.id}/handed`)).status,
		).toBe(204);
		expect(await copyState(COPY_A)).toMatchObject({
			state: "on_loan",
			holder_id: NOA,
		});

		const closed = await env.DB.prepare(
			"SELECT status, outcome FROM loans WHERE id = ?",
		)
			.bind(first)
			.first();
		expect(closed).toMatchObject({ status: "completed", outcome: "relayed" });
		// That loan is over: its thread heads for deletion, and the event says so.
		expect(await closedAt(first)).toBeTruthy();
		const events = await as(SAM).get("/v1/events");
		expect(
			events.body.events.some(
				(event: { kind: string; data: { loanId: string } }) =>
					event.kind === "loan.closed" && event.data.loanId === first,
			),
		).toBe(true);
	});

	it("a relay can be handed over with the code", async () => {
		await env.DB.prepare(
			"UPDATE members SET meeting_place = 'porch' WHERE id IN (?, ?)",
		)
			.bind(SAM, DANA)
			.run();
		const first = await activeLoan(SAM, DANA, COPY_A);
		const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body.id;
		await as(DANA).post(`/v1/loans/${relay}/accept`);
		await as(NOA).post(`/v1/loans/${relay}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		await as(SAM).post(`/v1/loans/${relay}/handoff/confirm`);
		const { code } = (await as(SAM).get(`/v1/loans/${relay}/handoff`)).body
			.handoff;
		expect(
			(await as(NOA).post(`/v1/loans/${relay}/handoff/complete`, { code }))
				.status,
		).toBe(204);
		expect(await copyState(COPY_A)).toMatchObject({
			state: "on_loan",
			holder_id: NOA,
		});
		const loans = await env.DB.prepare(
			"SELECT id, status, outcome FROM loans WHERE copy_id = ?",
		)
			.bind(COPY_A)
			.all();
		expect(loans.results).toHaveLength(2);
		expect(loans.results).toEqual(
			expect.arrayContaining([
				{ id: first, status: "completed", outcome: "relayed" },
				{ id: relay, status: "active", outcome: null },
			]),
		);
		expect(await closedAt(first)).toBeTruthy();
	});

	it("the reader who handed the book on leaves the next loan", async () => {
		await activeLoan(SAM, DANA, COPY_A);
		const relay = await as(NOA).post("/v1/loans", { copyId: COPY_A });
		await as(DANA).post(`/v1/loans/${relay.body.id}/accept`);
		// Before the handoff Sam arranges it with Noa.
		expect(
			(await as(SAM).get(`/v1/loans/${relay.body.id}/messages`)).status,
		).toBe(200);

		await as(SAM).post(`/v1/loans/${relay.body.id}/handed`);
		for (const path of ["messages", "handoff"]) {
			expect(
				(await as(SAM).get(`/v1/loans/${relay.body.id}/${path}`)).status,
			).toBe(404);
		}
		expect(
			(await as(SAM).post(`/v1/loans/${relay.body.id}/nudge`)).status,
		).toBe(404);
		expect(
			(
				await as(SAM).post(`/v1/loans/${relay.body.id}/messages`, {
					body: "hi",
				})
			).status,
		).toBe(404);
		const loans = await as(SAM).get("/v1/me/loans");
		expect(
			loans.body.relaying.map((loan: { id: string }) => loan.id),
		).not.toContain(relay.body.id);
	});

	it("only the borrower learns where a handoff happens", async () => {
		await env.DB.prepare("UPDATE members SET meeting_place = ? WHERE id = ?")
			.bind("Sam's porch", SAM)
			.run();
		await env.DB.prepare("UPDATE members SET meeting_place = ? WHERE id = ?")
			.bind("Dana's porch", DANA)
			.run();
		await activeLoan(SAM, DANA, COPY_A);
		const relay = await as(NOA).post("/v1/loans", { copyId: COPY_A });
		await as(DANA).post(`/v1/loans/${relay.body.id}/accept`);
		await as(NOA).post(`/v1/loans/${relay.body.id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		expect(
			(await as(SAM).post(`/v1/loans/${relay.body.id}/handoff/confirm`)).status,
		).toBe(204);

		const seen = async (who: string) =>
			(await as(who).get(`/v1/loans/${relay.body.id}/handoff`)).body.handoff;
		expect(await seen(NOA)).toMatchObject({ place: "Sam's porch", code: null });
		expect((await seen(SAM)).place).toBeNull();
		expect((await seen(SAM)).code).toMatch(/\w+/);
		// The owner is not part of this trip, and learns neither.
		expect(await seen(DANA)).toMatchObject({ place: null, code: null });
	});

	it("on a relay, the borrower writes to and hears from the reader handing it on", async () => {
		await activeLoan(SAM, DANA, COPY_A);
		const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body.id;
		await as(DANA).post(`/v1/loans/${relay}/accept`);
		const sent = () =>
			(
				env.NOTIFY as unknown as {
					sentMessages(): Promise<
						{ kind: string; to: string; fromName: string }[]
					>;
				}
			).sentMessages();
		const before = (await sent()).length;

		await as(NOA).post(`/v1/loans/${relay}/messages`, { body: "Tomorrow?" });
		expect((await as(SAM).post(`/v1/loans/${relay}/nudge`)).status).toBe(204);
		// The owner keeps a nudge of their own.
		expect((await as(DANA).post(`/v1/loans/${relay}/nudge`)).status).toBe(204);
		const told = (await sent())
			.slice(before)
			.filter((message) =>
				["loan_message", "loan_nudge"].includes(message.kind),
			)
			.map((message) => `${message.kind}:${message.to}:${message.fromName}`)
			.sort();
		expect(told).toEqual([
			"loan_message:sam@example.com:Noa",
			"loan_nudge:noa@example.com:Dana",
			"loan_nudge:noa@example.com:Sam",
		]);
	});

	it("a relay agreed on a book already out counts once against the lend limit", async () => {
		await env.DB.prepare("UPDATE members SET lend_limit = 2 WHERE id = ?")
			.bind(DANA)
			.run();
		try {
			await activeLoan(SAM, DANA, COPY_A);
			const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body
				.id;
			await as(DANA).post(`/v1/loans/${relay}/accept`);
			// One book out, a second one free: Noa may still ask for it.
			expect((await as(NOA).post("/v1/loans", { copyId: COPY_B })).status).toBe(
				201,
			);
		} finally {
			await env.DB.prepare("UPDATE members SET lend_limit = NULL WHERE id = ?")
				.bind(DANA)
				.run();
		}
	});

	it("on a relay, the owner cannot arrange the holder's handover", async () => {
		await env.DB.prepare(
			"UPDATE members SET meeting_place = 'Sam’s porch' WHERE id = ?",
		)
			.bind(SAM)
			.run();
		await activeLoan(SAM, DANA, COPY_A);
		const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body.id;
		await as(DANA).post(`/v1/loans/${relay}/accept`);
		const slot = { day: "2099-01-01", period: "evening" };

		expect(
			(await as(DANA).post(`/v1/loans/${relay}/handoff/propose`, slot)).status,
		).toBe(403);
		await as(NOA).post(`/v1/loans/${relay}/handoff/propose`, slot);
		expect(
			(await as(DANA).post(`/v1/loans/${relay}/handoff/confirm`)).status,
		).toBe(403);
		expect(
			(await as(DANA).post(`/v1/loans/${relay}/handoff/cancel`)).status,
		).toBe(403);
		// Nothing was agreed, so nothing of Sam's place reached Noa.
		const seen = (await as(NOA).get(`/v1/loans/${relay}/handoff`)).body.handoff;
		expect(seen).toMatchObject({ status: "proposed", place: null });
	});

	it("shows the holder's meeting note to the visitor once agreed", async () => {
		await as(SAM).put("/v1/me/availability", {
			slots: [],
			meetingPlace: "Sam’s porch",
			meetingNote: "Knock, don’t ring",
		});
		// Left out, the note is kept.
		await as(SAM).put("/v1/me/availability", {
			slots: [],
			meetingPlace: "Sam’s porch",
		});
		expect((await as(SAM).get("/v1/me/availability")).body).toMatchObject({
			meetingNote: "Knock, don’t ring",
		});
		await activeLoan(SAM, DANA, COPY_A);
		const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body.id;
		await as(DANA).post(`/v1/loans/${relay}/accept`);
		await as(NOA).post(`/v1/loans/${relay}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		const before = (await as(NOA).get(`/v1/loans/${relay}/handoff`)).body
			.handoff;
		expect(before).toMatchObject({ place: null, note: null });
		await as(SAM).post(`/v1/loans/${relay}/handoff/confirm`);
		const after = (await as(NOA).get(`/v1/loans/${relay}/handoff`)).body
			.handoff;
		expect(after).toMatchObject({
			place: "Sam’s porch",
			note: "Knock, don’t ring",
		});
		// The host has the code, not their own note.
		const host = (await as(SAM).get(`/v1/loans/${relay}/handoff`)).body.handoff;
		expect(host.note).toBeNull();
	});

	it("relays are refused on a copy that forbids them", async () => {
		await activeLoan(SAM, DANA, COPY_B);
		expect((await as(NOA).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			409,
		);
	});

	it("the head of the waitlist gets first dibs when a copy comes back", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		// COPY_A is also shelved and would satisfy the wait; take it off the table.
		await activeLoan(SAM, DANA, COPY_A);
		await as(NOA).post("/v1/waitlist", { workId: WORK });

		expect((await as(DANA).post(`/v1/loans/${id}/returned`)).status).toBe(204);
		const held = (await as(NOA).get("/v1/me/waitlist")).body.entries[0];
		expect(held.offer.copyId).toBe(COPY_B);
		// The book's page says it is Noa's to ask for, and held to everyone else.
		const onPage = async (who: string) =>
			(await as(who).get(`/v1/works/${WORK}`)).body.copies.find(
				(copy: { id: string }) => copy.id === COPY_B,
			);
		expect(await onPage(NOA)).toMatchObject({ heldUntil: null });
		expect((await onPage(NOA)).heldForMe).toBeGreaterThan(0);
		expect(await onPage(SAM)).toMatchObject({ heldForMe: null });
		expect((await onPage(SAM)).heldUntil).toBeGreaterThan(0);

		const other = await as(SAM).post("/v1/loans", { copyId: COPY_B });
		expect(other.status).toBe(409);
		expect(other.body.title).toBe("On hold");

		expect((await as(NOA).post("/v1/loans", { copyId: COPY_B })).status).toBe(
			201,
		);
		expect((await as(NOA).get("/v1/me/waitlist")).body.entries).toHaveLength(0);
	});

	it("a copy back with its owner waits for the next reader already agreed", async () => {
		const first = await activeLoan(SAM, DANA, COPY_A);
		const relay = (await as(NOA).post("/v1/loans", { copyId: COPY_A })).body.id;
		await as(DANA).post(`/v1/loans/${relay}/accept`);
		await env.DB.prepare(
			`INSERT INTO members (id, email, display_name, locale, created_at)
			 VALUES ('01J0MEMBER000000000000ELI0', 'eli@example.com', 'Eli', 'en', 1)`,
		).run();
		await env.DB.prepare(
			`INSERT INTO memberships (member_id, community_id, role, status, joined_at)
			 VALUES ('01J0MEMBER000000000000ELI0', '01J0COMMUNITY0000000FINCH', 'member', 'active', 1)`,
		).run();
		await as("01J0MEMBER000000000000ELI0").post("/v1/waitlist", {
			workId: WORK,
		});

		// Sam gave it back to Dana rather than to Noa.
		expect((await as(DANA).post(`/v1/loans/${first}/returned`)).status).toBe(
			204,
		);
		expect((await copyState(COPY_A)).state).toBe("reserved");
		// Noa's loan goes on, and nobody else is held for.
		const eli = (await as("01J0MEMBER000000000000ELI0").get("/v1/me/waitlist"))
			.body.entries[0];
		expect(eli.offer).toBeNull();
		expect((await as(DANA).post(`/v1/loans/${relay}/handed`)).status).toBe(204);
	});

	it("a lapsed hold passes on, and not straight back to who let it lapse", async () => {
		const ELI = "01J0MEMBER000000000000ELI0";
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO members (id, email, display_name, locale, created_at)
				 VALUES (?, 'eli@example.com', 'Eli', 'en', 1)`,
			).bind(ELI),
			env.DB.prepare(
				`INSERT INTO memberships (member_id, community_id, role, status, joined_at)
				 VALUES (?, '01J0COMMUNITY0000000FINCH', 'member', 'active', 1)`,
			).bind(ELI),
		]);
		const id = await activeLoan(SAM, DANA, COPY_B);
		await activeLoan(SAM, DANA, COPY_A);
		await as(NOA).post("/v1/waitlist", { workId: WORK });
		await as(DANA).post(`/v1/loans/${id}/returned`);
		const offerOf = async (who: string) =>
			(await as(who).get("/v1/me/waitlist")).body.entries[0]?.offer ?? null;
		expect((await offerOf(NOA))?.copyId).toBe(COPY_B);
		const lapse = () =>
			env.DB.prepare(
				"UPDATE waitlist SET offer_expires_at = unixepoch() - 1 WHERE offered_copy_id IS NOT NULL",
			).run();

		// Nobody else waits: the copy is free for anyone, not held for Noa again.
		await lapse();
		expect(await expireHolds(env)).toBe(1);
		expect(await offerOf(NOA)).toBeNull();
		expect((await as(ELI).post("/v1/waitlist", { workId: WORK })).status).toBe(
			201,
		);
		// Eli joined after Noa went to the back, even within the same second.
		await env.DB.prepare(
			"UPDATE waitlist SET created_at = created_at + 10 WHERE member_id = ?",
		)
			.bind(ELI)
			.run();

		// With Eli behind her, a lapse hands it to Eli.
		await onCopyAvailable(env, COPY_B);
		expect((await offerOf(NOA))?.copyId).toBe(COPY_B);
		await lapse();
		await expireHolds(env);
		expect(await offerOf(NOA)).toBeNull();
		expect((await offerOf(ELI))?.copyId).toBe(COPY_B);
	});

	it("part of a set coming free is told to the queue, not held", async () => {
		await activeLoan(NOA, DANA, COPY_A);
		await env.DB.prepare("UPDATE copies SET quantity = 12 WHERE id = ?")
			.bind(COPY_B)
			.run();
		const all = (
			await as(SAM).post("/v1/loans", { copyId: COPY_B, quantity: 12 })
		).body.id;
		await as(DANA).post(`/v1/loans/${all}/accept`);
		await as(DANA).post(`/v1/loans/${all}/handed`);
		await as(NOA).post("/v1/waitlist", { workId: WORK });

		await as(DANA).post(`/v1/loans/${all}/returned`);
		const noaEntry = async () =>
			(await as(NOA).get("/v1/me/waitlist")).body.entries[0] ?? null;
		// Told, but nothing held: Sam may ask for some straight away.
		expect((await noaEntry())?.offer).toBeNull();
		expect(
			(await as(SAM).post("/v1/loans", { copyId: COPY_B, quantity: 1 })).status,
		).toBe(201);
		// Noa asks too, and her place in the queue is spent.
		expect(
			(await as(NOA).post("/v1/loans", { copyId: COPY_B, quantity: 2 })).status,
		).toBe(201);
		expect(await noaEntry()).toBeNull();
	});

	it("a hold is lifted when its copy stops being lendable, and the place kept", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		await activeLoan(SAM, DANA, COPY_A);
		await as(NOA).post("/v1/waitlist", { workId: WORK });
		const entry = async () =>
			(await as(NOA).get("/v1/me/waitlist")).body.entries[0];
		const holdAgain = async () => {
			await onCopyAvailable(env, COPY_B);
			expect((await entry()).offer?.copyId).toBe(COPY_B);
		};
		await as(DANA).post(`/v1/loans/${id}/returned`);
		expect((await entry()).offer?.copyId).toBe(COPY_B);

		// Paused by its owner.
		await as(DANA).patch(`/v1/copies/${COPY_B}`, { lending: "paused" });
		expect((await entry()).offer).toBeNull();
		await as(DANA).patch(`/v1/copies/${COPY_B}`, { lending: "lendable" });
		expect((await entry()).offer?.copyId).toBe(COPY_B);

		// Its owner away, then back.
		await as(DANA).patch("/v1/me", {
			awayUntil: Math.floor(Date.now() / 1000) + 86400,
		});
		expect((await entry()).offer).toBeNull();
		await as(DANA).patch("/v1/me", { awayUntil: null });
		expect((await entry()).offer?.copyId).toBe(COPY_B);

		// Retired by a moderator: Noa keeps her place in the queue.
		const position = (await entry()).position;
		await as(DANA).post(`/v1/admin/copies/${COPY_B}/retire`);
		expect(await entry()).toMatchObject({ offer: null, position });
		await env.DB.prepare("UPDATE copies SET state = 'shelved' WHERE id = ?")
			.bind(COPY_B)
			.run();
		await holdAgain();

		// Leaving the queue with it held passes it on.
		const ELI = "01J0MEMBER000000000000ELI0";
		await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO members (id, email, display_name, locale, created_at)
				 VALUES (?, 'eli@example.com', 'Eli', 'en', 1)`,
			).bind(ELI),
			env.DB.prepare(
				`INSERT INTO memberships (member_id, community_id, role, status, joined_at)
				 VALUES (?, '01J0COMMUNITY0000000FINCH', 'member', 'active', 1)`,
			).bind(ELI),
		]);
		await as(ELI).post("/v1/waitlist", { workId: WORK });
		await as(NOA).del(`/v1/waitlist/${(await entry()).id}`);
		const eli = (await as(ELI).get("/v1/me/waitlist")).body.entries[0];
		expect(eli.offer?.copyId).toBe(COPY_B);
	});

	it("a return confirmed with the code also offers the copy to the waitlist", async () => {
		await env.DB.prepare(
			"UPDATE members SET meeting_place = 'porch' WHERE id IN (?, ?)",
		)
			.bind(SAM, DANA)
			.run();
		const id = await activeLoan(SAM, DANA, COPY_B);
		await activeLoan(SAM, DANA, COPY_A);
		await as(NOA).post("/v1/waitlist", { workId: WORK });

		await as(SAM).post(`/v1/loans/${id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		await as(DANA).post(`/v1/loans/${id}/handoff/confirm`);
		const { code } = (await as(DANA).get(`/v1/loans/${id}/handoff`)).body
			.handoff;
		expect(
			(await as(SAM).post(`/v1/loans/${id}/handoff/complete`, { code })).status,
		).toBe(204);
		const held = (await as(NOA).get("/v1/me/waitlist")).body.entries[0];
		expect(held.offer?.copyId).toBe(COPY_B);
		expect(await closedAt(id)).toBeTruthy();
	});
});

describe("reports", () => {
	it("sits in the reporter's timeline, never the other side's, and is not a nudge", async () => {
		const id = await activeLoan(SAM, DANA, COPY_A);
		const filed = await as(SAM).post(`/v1/loans/${id}/report`, {
			kind: "conduct",
			body: "Did not answer for a week",
		});
		expect(filed.status).toBe(201);

		const mine = await as(SAM).get(`/v1/loans/${id}/messages`);
		expect(mine.body.reports).toEqual([
			expect.objectContaining({
				kind: "conduct",
				body: "Did not answer for a week",
				reporterId: SAM,
			}),
		]);
		expect(mine.body.reports[0].createdAt).toBeGreaterThan(0);
		expect(
			(await as(DANA).get(`/v1/loans/${id}/messages`)).body.reports,
		).toEqual([]);

		// Reporting is not nudging: both sides can still nudge today.
		const loans = await as(SAM).get("/v1/me/loans");
		const loan = loans.body.borrowing.find(
			(row: { id: string }) => row.id === id,
		);
		expect(loan.nudgeCooldown).toBe(0);
		expect((await as(SAM).post(`/v1/loans/${id}/nudge`)).status).toBe(204);
	});

	it("carries a conversation between the reporter and the moderators, and the outcome", async () => {
		const id = await activeLoan(SAM, DANA, COPY_A);
		// Noa moderates here, so the report is not about one of its handlers.
		await env.DB.prepare(
			"UPDATE memberships SET role = 'moderator' WHERE member_id = ?",
		)
			.bind(NOA)
			.run();
		const filed = await as(SAM).post(`/v1/loans/${id}/report`, {
			kind: "conduct",
		});
		const report = filed.body.id as string;

		expect(
			(
				await as(NOA).post(`/v1/admin/reports/${report}/replies`, {
					body: "What happened?",
				})
			).status,
		).toBe(204);
		expect(
			(
				await as(SAM).post(`/v1/reports/${report}/replies`, {
					body: "Rude at the door",
				})
			).status,
		).toBe(204);
		// The member it is about can neither write nor read any of it.
		expect(
			(await as(DANA).post(`/v1/reports/${report}/replies`, { body: "Hi" }))
				.status,
		).toBe(404);
		expect(
			(await as(DANA).get(`/v1/loans/${id}/messages`)).body.reports,
		).toEqual([]);

		expect(
			(
				await as(NOA).post(`/v1/admin/reports/${report}/resolve`, {
					resolution: "Spoke to both",
				})
			).status,
		).toBe(204);

		const mine = (await as(SAM).get(`/v1/loans/${id}/messages`)).body
			.reports[0];
		expect(mine).toMatchObject({
			status: "resolved",
			resolution: "Spoke to both",
		});
		expect(mine.replies).toEqual([
			expect.objectContaining({
				fromModerators: true,
				authorName: null,
				body: "What happened?",
			}),
			expect.objectContaining({
				fromModerators: false,
				body: "Rude at the door",
			}),
		]);
		const thread = await as(NOA).get(`/v1/admin/reports/${report}/thread`);
		expect(thread.body.reports[0].replies[0].authorName).toBe("Noa");

		await env.DB.prepare(
			"UPDATE memberships SET role = 'member' WHERE member_id = ?",
		)
			.bind(NOA)
			.run();
	});

	it("shows the moderators every report on the loan, in the thread", async () => {
		const id = await activeLoan(SAM, DANA, COPY_A);
		const filed = await as(SAM).post(`/v1/loans/${id}/report`, {
			kind: "no_show",
		});
		const thread = await as(DANA).get(
			`/v1/admin/reports/${filed.body.id}/thread`,
		);
		expect(thread.body.reports).toEqual([
			expect.objectContaining({
				id: filed.body.id,
				kind: "no_show",
				body: null,
			}),
		]);
	});

	it("a loss closes the loan, shelves nothing, and lands on the moderator's list", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const filed = await as(DANA).post(`/v1/loans/${id}/report`, {
			kind: "loss",
			body: "gone",
		});
		expect(filed.status).toBe(201);
		expect((await copyState(COPY_B)).state).toBe("lost");

		const attention = await as(DANA).get("/v1/admin/attention");
		expect(attention.body.items[0]).toMatchObject({
			kind: "report",
			reportKind: "loss",
			loanId: id,
		});

		expect((await as(SAM).get("/v1/admin/reports")).status).toBe(403);
		const list = await as(DANA).get("/v1/admin/reports");
		expect(list.body.reports[0]).toMatchObject({
			kind: "loss",
			status: "open",
			subject: { id: SAM },
		});
	});

	it("dismissing a loss puts the book back on the shelf", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const { body } = await as(DANA).post(`/v1/loans/${id}/report`, {
			kind: "loss",
		});
		const closed = await as(DANA).post(`/v1/admin/reports/${body.id}/dismiss`, {
			resolution: "found",
		});
		expect(closed.status).toBe(204);
		expect(await copyState(COPY_B)).toMatchObject({
			state: "shelved",
			holder_id: DANA,
		});
		expect((await as(DANA).get("/v1/admin/attention")).body.items).toHaveLength(
			0,
		);
	});

	it("dismissing a loss puts back only what that report took", async () => {
		const quantity = async () =>
			(await env.DB.prepare("SELECT quantity, state FROM copies WHERE id = ?")
				.bind(COPY_B)
				.first())!;
		const dismiss = (report: string) =>
			as(DANA).post(`/v1/admin/reports/${report}/dismiss`, {
				resolution: "found",
			});

		// Told before the handover: nothing was lost, so nothing comes back.
		const early = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		const before = await as(SAM).post(`/v1/loans/${early}/report`, {
			kind: "loss",
		});
		expect((await dismiss(before.body.id)).status).toBe(204);
		expect(await quantity()).toEqual({ quantity: 1, state: "shelved" });
		await as(SAM).post(`/v1/loans/${early}/cancel`);

		// Told by both sides: the first took it, the second took nothing.
		const id = await activeLoan(SAM, DANA, COPY_B);
		const first = await as(SAM).post(`/v1/loans/${id}/report`, {
			kind: "loss",
		});
		const second = await as(DANA).post(`/v1/loans/${id}/report`, {
			kind: "loss",
		});
		expect(await quantity()).toEqual({ quantity: 1, state: "lost" });
		await dismiss(second.body.id);
		expect(await quantity()).toEqual({ quantity: 1, state: "lost" });
		await dismiss(first.body.id);
		expect(await quantity()).toEqual({ quantity: 1, state: "shelved" });
	});

	it("a set lost in two parts comes back part by part", async () => {
		await env.DB.prepare("UPDATE copies SET quantity = 10 WHERE id = ?")
			.bind(COPY_B)
			.run();
		const lend = async (who: string, quantity: number) => {
			const id = (await as(who).post("/v1/loans", { copyId: COPY_B, quantity }))
				.body.id;
			await as(DANA).post(`/v1/loans/${id}/accept`);
			await as(DANA).post(`/v1/loans/${id}/handed`);
			return (await as(who).post(`/v1/loans/${id}/report`, { kind: "loss" }))
				.body.id as string;
		};
		const three = await lend(SAM, 3);
		const seven = await lend(NOA, 7);
		const copy = () =>
			env.DB.prepare("SELECT quantity, state FROM copies WHERE id = ?")
				.bind(COPY_B)
				.first();
		expect(await copy()).toEqual({ quantity: 7, state: "lost" });
		await as(DANA).post(`/v1/admin/reports/${three}/dismiss`, {});
		expect(await copy()).toEqual({ quantity: 3, state: "shelved" });
		await as(DANA).post(`/v1/admin/reports/${seven}/dismiss`, {});
		expect(await copy()).toEqual({ quantity: 10, state: "shelved" });
	});

	it("outsiders cannot report on a loan", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		expect(
			(await as(NOA).post(`/v1/loans/${id}/report`, { kind: "conduct" }))
				.status,
		).toBe(404);
	});
});

describe("unread on a loan", () => {
	const unreadOn = async (who: string, id: string) => {
		const loans = await as(who).get("/v1/me/loans");
		const all = [
			...loans.body.borrowing,
			...loans.body.lending,
			...loans.body.relaying,
		];
		return all.find((loan: { id: string }) => loan.id === id)?.unread ?? 0;
	};

	it("counts the other side's messages until the thread is read", async () => {
		const id = await activeLoan(SAM, DANA, COPY_A);
		await as(SAM).get(`/v1/loans/${id}/messages`);
		const before = (await as(SAM).get("/v1/me")).body.attention as number;

		await new Promise((resolve) => setTimeout(resolve, 1100));
		await as(DANA).post(`/v1/loans/${id}/messages`, { body: "Tomorrow?" });
		expect(await unreadOn(SAM, id)).toBe(1);
		expect((await as(SAM).get("/v1/me")).body.attention).toBe(before + 1);
		// Their own message is not unread to them.
		await as(DANA).get(`/v1/loans/${id}/messages`);
		expect(await unreadOn(DANA, id)).toBe(0);

		await as(SAM).get(`/v1/loans/${id}/messages`);
		expect(await unreadOn(SAM, id)).toBe(0);
	});

	it("counts a moderator's reply on the reporter's own report", async () => {
		const id = await activeLoan(SAM, DANA, COPY_A);
		const filed = await as(SAM).post(`/v1/loans/${id}/report`, {
			kind: "other",
		});
		await as(SAM).get(`/v1/loans/${id}/messages`);
		await new Promise((resolve) => setTimeout(resolve, 1100));
		await as(DANA).post(`/v1/admin/reports/${filed.body.id}/replies`, {
			body: "Looking into it",
		});
		expect(await unreadOn(SAM, id)).toBe(1);
		// The member the report is about hears nothing of it.
		expect(await unreadOn(DANA, id)).toBe(0);
	});
});

describe("the moderators' view of loans", () => {
	it("counts what is out and lists who has what, for moderators only", async () => {
		const before = (await as(DANA).get("/v1/admin/stats")).body.activeLoans;
		const id = await activeLoan(SAM, DANA, COPY_A);
		expect((await as(DANA).get("/v1/admin/stats")).body.activeLoans).toBe(
			before + 1,
		);
		const list = await as(DANA).get("/v1/admin/loans");
		expect(list.status).toBe(200);
		expect(list.body.loans).toContainEqual(
			expect.objectContaining({
				id,
				status: "active",
				borrower: { id: SAM, displayName: "Sam" },
			}),
		);
		// Nothing of what they said to each other.
		expect(JSON.stringify(list.body)).not.toContain("messages");
		expect((await as(SAM).get("/v1/admin/loans")).status).toBe(403);
	});
});

describe("handoffs follow their loan", () => {
	const agree = async (id: string, proposer: string, confirmer: string) => {
		await as(proposer).post(`/v1/loans/${id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		await as(confirmer).post(`/v1/loans/${id}/handoff/confirm`);
		return (await env.DB.prepare(
			"SELECT id, code FROM handoffs WHERE loan_id = ? AND status = 'agreed'",
		)
			.bind(id)
			.first<{ id: string; code: string }>())!;
	};
	const statusOf = async (handoff: string) =>
		(await env.DB.prepare("SELECT status FROM handoffs WHERE id = ?")
			.bind(handoff)
			.first<{ status: string }>())!.status;

	it("a cancelled loan takes its agreed handoff with it", async () => {
		const loan = await as(NOA).post("/v1/loans", { copyId: COPY_B });
		await as(DANA).post(`/v1/loans/${loan.body.id}/accept`);
		const handoff = await agree(loan.body.id, NOA, DANA);
		await as(NOA).post(`/v1/loans/${loan.body.id}/cancel`);

		expect(await statusOf(handoff.id)).toBe("cancelled");
		expect(
			(
				await as(NOA).post(`/v1/loans/${loan.body.id}/handoff/complete`, {
					code: handoff.code,
				})
			).status,
		).toBe(404);
		expect(await copyState(COPY_B)).toMatchObject({
			state: "shelved",
			holder_id: DANA,
		});
	});

	it("a return marked by hand drops the return handoff", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const handoff = await agree(id, SAM, DANA);
		await as(DANA).post(`/v1/loans/${id}/returned`);
		expect(await statusOf(handoff.id)).toBe("cancelled");

		// The copy goes to someone else; the old code cannot pull it back.
		await activeLoan(NOA, DANA, COPY_B);
		await as(SAM).post(`/v1/loans/${id}/handoff/complete`, {
			code: handoff.code,
		});
		expect(await copyState(COPY_B)).toMatchObject({
			state: "on_loan",
			holder_id: NOA,
		});
	});

	it("a lost book ends the handoffs arranged for it", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const handoff = await agree(id, SAM, DANA);
		await as(SAM).post(`/v1/loans/${id}/report`, { kind: "loss" });
		expect(await statusOf(handoff.id)).toBe("cancelled");
	});
});

describe("a loan waiting for a time", () => {
	const attention = async (who: string) =>
		(await as(who).get("/v1/me")).body.attention as number;
	const needsTime = async (who: string, id: string) => {
		const loans = (await as(who).get("/v1/me/loans")).body;
		return [...loans.borrowing, ...loans.lending, ...loans.relaying].find(
			(loan: { id: string }) => loan.id === id,
		)?.needsTime as boolean;
	};

	it("is asked of both sides after a day, until one puts forward a time", async () => {
		const { body } = await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await as(DANA).post(`/v1/loans/${body.id}/accept`);
		const before = { sam: await attention(SAM), dana: await attention(DANA) };
		expect(await needsTime(SAM, body.id)).toBe(false);

		await env.DB.prepare(
			"UPDATE loans SET decided_at = unixepoch() - 90000 WHERE id = ?",
		)
			.bind(body.id)
			.run();
		expect(await needsTime(SAM, body.id)).toBe(true);
		expect(await needsTime(DANA, body.id)).toBe(true);
		expect(await attention(SAM)).toBe(before.sam + 1);
		expect(await attention(DANA)).toBe(before.dana + 1);

		await as(SAM).post(`/v1/loans/${body.id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		expect(await needsTime(SAM, body.id)).toBe(false);
		expect(await attention(SAM)).toBe(before.sam);
	});
});

describe("a handoff with no meeting place", () => {
	it("tells both sides there is no place to show", async () => {
		await env.DB.prepare("UPDATE members SET meeting_place = NULL WHERE id = ?")
			.bind(DANA)
			.run();
		const { body } = await as(SAM).post("/v1/loans", { copyId: COPY_B });
		await as(DANA).post(`/v1/loans/${body.id}/accept`);
		await as(SAM).post(`/v1/loans/${body.id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		await as(DANA).post(`/v1/loans/${body.id}/handoff/confirm`);

		const seen = (await as(SAM).get(`/v1/loans/${body.id}/handoff`)).body
			.handoff;
		expect(seen).toMatchObject({
			status: "agreed",
			place: null,
			placeMissing: true,
		});
		const hosted = (await as(DANA).get(`/v1/loans/${body.id}/handoff`)).body
			.handoff;
		expect(hosted.placeMissing).toBe(true);

		await env.DB.prepare("UPDATE members SET meeting_place = ? WHERE id = ?")
			.bind("12 Church Road", DANA)
			.run();
		expect(
			(await as(SAM).get(`/v1/loans/${body.id}/handoff`)).body.handoff,
		).toMatchObject({ place: "12 Church Road", placeMissing: false });
	});
});

describe("two answers at once", () => {
	const loanRow = (id: string) =>
		env.DB.prepare("SELECT status, extensions FROM loans WHERE id = ?")
			.bind(id)
			.first<{ status: string; extensions: number }>();

	it("an accept and a decline: one wins, and the copy follows it", async () => {
		const id = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		const answers = await Promise.all([
			as(DANA).post(`/v1/loans/${id}/accept`),
			as(DANA).post(`/v1/loans/${id}/decline`),
		]);
		// The loser read the request too late (404) or wrote it too late (409).
		const [won, lost] = answers.map((answer) => answer.status).sort();
		expect(won).toBe(204);
		expect([404, 409]).toContain(lost);
		const { status } = (await loanRow(id))!;
		expect((await copyState(COPY_B)).state).toBe(
			status === "accepted" ? "reserved" : "shelved",
		);
	});

	it("a cancel and an accept: the loan ends cancelled, the copy free", async () => {
		const id = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		await Promise.all([
			as(SAM).post(`/v1/loans/${id}/cancel`),
			as(DANA).post(`/v1/loans/${id}/accept`),
		]);
		expect((await loanRow(id))!.status).toBe("cancelled");
		expect((await copyState(COPY_B)).state).toBe("shelved");
	});

	it("a handover and a cancel: the copy is where the loan says", async () => {
		const id = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		await as(DANA).post(`/v1/loans/${id}/accept`);
		await Promise.all([
			as(DANA).post(`/v1/loans/${id}/handed`),
			as(SAM).post(`/v1/loans/${id}/cancel`),
		]);
		const { status } = (await loanRow(id))!;
		expect(["active", "cancelled"]).toContain(status);
		expect((await copyState(COPY_B)).state).toBe(
			status === "active" ? "on_loan" : "shelved",
		);
	});

	it("a confirm and a cancel of a handoff: it never ends agreed", async () => {
		const id = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		await as(DANA).post(`/v1/loans/${id}/accept`);
		await as(SAM).post(`/v1/loans/${id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		const [confirmed] = await Promise.all([
			as(DANA).post(`/v1/loans/${id}/handoff/confirm`),
			as(SAM).post(`/v1/loans/${id}/handoff/cancel`),
		]);
		// Agreed then cancelled, or cancelled before the confirm could land.
		expect([204, 404]).toContain(confirmed.status);
		const { n } = (await env.DB.prepare(
			"SELECT count(*) AS n FROM handoffs WHERE loan_id = ? AND status IN ('proposed', 'agreed')",
		)
			.bind(id)
			.first<{ n: number }>())!;
		expect(n).toBe(0);
	});

	it("a confirm and a new proposal: an agreed handoff is never replaced", async () => {
		const id = (await as(SAM).post("/v1/loans", { copyId: COPY_B })).body.id;
		await as(DANA).post(`/v1/loans/${id}/accept`);
		await as(SAM).post(`/v1/loans/${id}/handoff/propose`, {
			day: "2099-01-01",
			period: "evening",
		});
		const [confirmed, proposed] = await Promise.all([
			as(DANA).post(`/v1/loans/${id}/handoff/confirm`),
			as(SAM).post(`/v1/loans/${id}/handoff/propose`, {
				day: "2099-01-02",
				period: "morning",
			}),
		]);
		// Agreed and the new slot refused, or re-proposed before the confirm could land.
		const open = await env.DB.prepare(
			"SELECT status, day FROM handoffs WHERE loan_id = ? AND status IN ('proposed', 'agreed')",
		)
			.bind(id)
			.all<{ status: string; day: string }>();
		expect(open.results).toHaveLength(1);
		if (confirmed.status === 204) {
			expect(proposed.status).toBe(409);
			expect(open.results[0]).toEqual({ status: "agreed", day: "2099-01-01" });
		} else {
			expect(confirmed.status).toBe(404);
			expect(proposed.status).toBe(201);
			expect(open.results[0]).toEqual({
				status: "proposed",
				day: "2099-01-02",
			});
		}
	});

	it("every extension counted moved the due date", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const due = async () =>
			(await env.DB.prepare("SELECT due_at FROM loans WHERE id = ?")
				.bind(id)
				.first<{ due_at: number }>())!.due_at;
		const before = await due();
		await Promise.all([
			as(DANA).post(`/v1/loans/${id}/extend`, { days: 7 }),
			as(DANA).post(`/v1/loans/${id}/extend`, { days: 7 }),
		]);
		// Two at once used to count two and move the date by one.
		const { extensions } = (await loanRow(id))!;
		expect(extensions).toBeGreaterThan(0);
		expect((await due()) - before).toBe(extensions * 7 * 86_400);
	});

	it("two nudges at once reach the other side once", async () => {
		const id = await activeLoan(SAM, DANA, COPY_B);
		const sent = () =>
			(
				env.NOTIFY as unknown as {
					sentMessages(): Promise<{ kind: string }[]>;
				}
			).sentMessages();
		const before = (await sent()).length;
		const nudges = await Promise.all([
			as(SAM).post(`/v1/loans/${id}/nudge`),
			as(SAM).post(`/v1/loans/${id}/nudge`),
		]);
		expect(nudges.map((nudge) => nudge.status).sort()).toEqual([204, 429]);
		expect(
			(await sent())
				.slice(before)
				.filter((message) => message.kind === "loan_nudge"),
		).toHaveLength(1);
	});

	it("part of a set asked for twice at once is one loan", async () => {
		await env.DB.prepare("UPDATE copies SET quantity = 10 WHERE id = ?")
			.bind(COPY_B)
			.run();
		const asks = await Promise.all([
			as(SAM).post("/v1/loans", { copyId: COPY_B, quantity: 2 }),
			as(SAM).post("/v1/loans", { copyId: COPY_B, quantity: 2 }),
		]);
		expect(asks.map((ask) => ask.status).sort()).toEqual([201, 409]);
		const { n } = (await env.DB.prepare(
			"SELECT count(*) AS n FROM loans WHERE copy_id = ? AND borrower_id = ?",
		)
			.bind(COPY_B, SAM)
			.first<{ n: number }>())!;
		expect(n).toBe(1);
	});

	it("a loss told by both sides comes off the shelf once", async () => {
		await env.DB.prepare("UPDATE copies SET quantity = 10 WHERE id = ?")
			.bind(COPY_B)
			.run();
		const id = (
			await as(SAM).post("/v1/loans", { copyId: COPY_B, quantity: 3 })
		).body.id;
		await as(DANA).post(`/v1/loans/${id}/accept`);
		await as(DANA).post(`/v1/loans/${id}/handed`);
		await Promise.all([
			as(SAM).post(`/v1/loans/${id}/report`, { kind: "loss" }),
			as(DANA).post(`/v1/loans/${id}/report`, { kind: "loss" }),
		]);
		const copy = await env.DB.prepare(
			"SELECT state, quantity FROM copies WHERE id = ?",
		)
			.bind(COPY_B)
			.first();
		expect(copy).toEqual({ state: "shelved", quantity: 7 });
	});
});
