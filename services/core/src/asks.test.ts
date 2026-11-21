import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { as, DANA, NOA, SAM } from "../test/api.ts";
import { forget, vocabularyKey } from "./cache.ts";
import { periodOf } from "./routes-asks.ts";

const FINCH = "01J0COMMUNITY0000000FINCH";

const becomes = async (type: "books" | "things") => {
	await env.DB.prepare("UPDATE communities SET type = ? WHERE id = ?")
		.bind(type, FINCH)
		.run();
	await forget(env, vocabularyKey(FINCH));
};

const sent = async () =>
	(
		await (
			env.NOTIFY as unknown as {
				sentMessages(): Promise<
					{ kind: string; to: string; stage?: string; offered?: string }[]
				>;
			}
		).sentMessages()
	).filter((message) => message.kind === "ask");

/** Sam asks for a saw today; the answer carries its id. */
const ask = async (
	body: Record<string, unknown> = {},
): Promise<{ status: number; id: string }> => {
	const asked = await as(SAM).post("/v1/asks", {
		what: "Saw",
		note: "Hand saw or small chainsaw",
		by: "today",
		days: 1,
		...body,
	});
	return { status: asked.status, id: asked.body?.id };
};

/** Dana offers her hand saw: come by now, until six. */
const offer = (askId: string, member = DANA, body: object = {}) =>
	as(member).post(`/v1/asks/${askId}/offers`, {
		name: "Hand saw",
		come: "now",
		time: "18:00",
		note: "Top bell",
		meetingPlace: "12 Elm Road",
		...body,
	});

beforeEach(async () => {
	await becomes("things");
	await env.DB.prepare("UPDATE members SET meeting_place = NULL").run();
});
afterEach(async () => {
	await becomes("books");
});

describe("asks", () => {
	it("a books library takes none", async () => {
		await becomes("books");
		expect((await ask()).status).toBe(404);
		expect((await as(DANA).get("/v1/asks")).body.asks).toEqual([]);
	});

	it("an ask is listed for the neighbours, today's first, with nobody's offers shown", async () => {
		const later = await ask({ what: "Ladder", by: "whenever", days: 7 });
		const today = await ask();
		expect(today.status).toBe(201);

		const listed = (await as(DANA).get("/v1/asks")).body.asks;
		expect(listed.map((one: { what: string }) => one.what)).toEqual([
			"Saw",
			"Ladder",
		]);
		expect(listed[0]).toMatchObject({
			id: today.id,
			note: "Hand saw or small chainsaw",
			by: "today",
			days: 1,
			status: "open",
			mine: false,
			asker: { displayName: "Sam" },
			offerCount: 0,
			myOffer: null,
			offers: [],
		});
		expect(later.status).toBe(201);
	});

	it("a member has three asks open at most", async () => {
		for (const what of ["Saw", "Ladder", "Drill"])
			expect((await ask({ what })).status).toBe(201);
		expect((await ask({ what: "Tent" })).status).toBe(409);
	});

	it("an ask says what is wrong with it", async () => {
		expect((await ask({ what: " " })).status).toBe(422);
		expect((await ask({ days: 2 })).status).toBe(422);
		expect((await ask({ by: "yesterday" })).status).toBe(422);
	});

	it("an offer reaches the asker and nobody else, and is made once", async () => {
		const { id } = await ask();
		const before = (await sent()).length;
		expect((await offer(id)).status).toBe(201);
		expect((await offer(id)).status).toBe(409);
		expect((await offer(id, SAM)).status).toBe(409); // their own ask

		expect((await sent()).slice(before)).toEqual([
			expect.objectContaining({
				to: "sam@example.com",
				stage: "offer",
				offered: "Hand saw",
			}),
		]);
		const mine = (await as(SAM).get("/v1/me/asks")).body;
		expect(mine.asks[0].offers).toEqual([
			expect.objectContaining({
				name: "Hand saw",
				come: "now",
				time: "18:00",
				note: "Top bell",
				status: "offered",
				by: expect.objectContaining({ displayName: "Dana" }),
			}),
		]);
		// Noa sees that somebody offered, not who or what.
		const forNoa = (await as(NOA).get(`/v1/asks/${id}`)).body;
		expect(forNoa).toMatchObject({ offerCount: 1, offers: [], myOffer: null });
		// Dana sees her own.
		expect((await as(DANA).get("/v1/me/asks")).body.offers).toEqual([
			expect.objectContaining({
				offer: expect.objectContaining({ name: "Hand saw" }),
				ask: expect.objectContaining({ what: "Saw" }),
			}),
		]);
	});

	it("come by now needs somewhere to come to, said once and kept", async () => {
		const { id } = await ask();
		expect((await offer(id, DANA, { meetingPlace: undefined })).status).toBe(
			422,
		);
		expect((await as(DANA).get(`/v1/asks/${id}`)).body.placeMissing).toBe(true);
		expect((await offer(id)).status).toBe(201);
		expect(
			await env.DB.prepare("SELECT meeting_place FROM members WHERE id = ?")
				.bind(DANA)
				.first("meeting_place"),
		).toBe("12 Elm Road");
		expect((await as(DANA).get(`/v1/asks/${id}`)).body.placeMissing).toBe(
			false,
		);
	});

	it("taking an offer makes an accepted loan with today's meeting agreed, on no shelf", async () => {
		const { id } = await ask();
		const hers = (await offer(id)).body.id;
		const his = (
			await offer(id, NOA, { name: "Small chainsaw", time: "17:00" })
		).body.id;
		const before = (await sent()).length;

		const taken = await as(SAM).post(`/v1/asks/${id}/offers/${hers}/take`);
		expect(taken.status).toBe(201);
		const loanId = taken.body.loanId as string;
		// A second tap, and the other offer, find the ask over.
		expect(
			(await as(SAM).post(`/v1/asks/${id}/offers/${hers}/take`)).status,
		).toBe(404);
		expect(
			(await as(SAM).post(`/v1/asks/${id}/offers/${his}/take`)).status,
		).toBe(404);

		const loans = (await as(SAM).get("/v1/me/loans")).body.borrowing;
		expect(loans).toEqual([
			expect.objectContaining({
				id: loanId,
				status: "accepted",
				message: "Hand saw or small chainsaw",
				lender: expect.objectContaining({ displayName: "Dana" }),
				copy: expect.objectContaining({ title: "Hand saw" }),
				meeting: expect.objectContaining({ period: "evening", agreed: true }),
				ask: expect.objectContaining({
					what: "Saw",
					come: "now",
					time: "18:00",
					note: "Top bell",
				}),
			}),
		]);
		// The borrower learns where; the lender holds the code.
		const forSam = (await as(SAM).get(`/v1/loans/${loanId}/handoff`)).body
			.handoff;
		expect(forSam).toMatchObject({
			status: "agreed",
			place: "12 Elm Road",
			code: null,
		});
		const forDana = (await as(DANA).get(`/v1/loans/${loanId}/handoff`)).body
			.handoff;
		expect(forDana.code).toMatch(/^[A-Z2-9]{6}$/);

		// Dana hears it was taken; Noa that it is sorted.
		expect((await sent()).slice(before)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ to: "dana@example.com", stage: "taken" }),
				expect.objectContaining({ to: "noa@example.com", stage: "sorted" }),
			]),
		);
		// Nothing of it is on the shelves, or among the asks.
		const shelves = (await as(NOA).get("/v1/copies?q=saw")).body;
		expect(JSON.stringify(shelves)).not.toContain("Hand saw");
		expect((await as(NOA).get("/v1/asks")).body.asks).toEqual([]);

		// It changes hands with the code, and is due in the day asked for.
		expect(
			(
				await as(SAM).post(`/v1/loans/${loanId}/handoff/complete`, {
					code: forDana.code,
				})
			).status,
		).toBeLessThan(300);
		const [active] = (await as(SAM).get("/v1/me/loans")).body.borrowing;
		expect(active.status).toBe("active");
		expect(active.dueAt - active.startedAt).toBe(86_400);
	});

	it("at the lender's usual times, the meeting is left to arrange", async () => {
		const { id } = await ask({ by: "week" });
		const hers = (
			await offer(id, DANA, {
				come: "usual",
				time: undefined,
				meetingPlace: undefined,
			})
		).body.id;
		const taken = await as(SAM).post(`/v1/asks/${id}/offers/${hers}/take`);
		expect(taken.status).toBe(201);
		const [loan] = (await as(SAM).get("/v1/me/loans")).body.borrowing;
		expect(loan).toMatchObject({ status: "accepted", meeting: null });
	});

	it("kept after the loan, it goes on the shelf; not kept, it is gone", async () => {
		const lend = async (name: string) => {
			const { id } = await ask();
			const hers = (await offer(id, DANA, { name })).body.id;
			const loanId = (await as(SAM).post(`/v1/asks/${id}/offers/${hers}/take`))
				.body.loanId as string;
			await as(DANA).post(`/v1/loans/${loanId}/handed`);
			return { offerId: hers as string, loanId };
		};
		const kept = await lend("Hand saw");
		// Nothing to decide while it is out.
		expect((await as(DANA).get("/v1/me/asks")).body.keep).toEqual([]);
		expect(
			(
				await as(DANA).post(`/v1/ask-offers/${kept.offerId}/keep`, {
					keep: true,
				})
			).status,
		).toBe(404);
		await as(DANA).post(`/v1/loans/${kept.loanId}/returned`);

		expect((await as(DANA).get("/v1/me/asks")).body.keep).toEqual([
			{
				offerId: kept.offerId,
				name: "Hand saw",
				after: "returned",
				askerName: "Sam",
				what: "Saw",
			},
		]);
		const yes = await as(DANA).post(`/v1/ask-offers/${kept.offerId}/keep`, {
			keep: true,
		});
		expect(yes.status).toBe(200);
		expect(yes.body.copyId).toBeTruthy();
		expect((await as(DANA).get("/v1/me/asks")).body.keep).toEqual([]);
		// Asked once.
		expect(
			(
				await as(DANA).post(`/v1/ask-offers/${kept.offerId}/keep`, {
					keep: false,
				})
			).status,
		).toBe(404);
		// On the shelf now, for a neighbour to ask for in the usual way.
		expect(
			(await as(NOA).post("/v1/loans", { copyId: yes.body.copyId })).status,
		).toBe(201);

		const gone = await lend("Bow saw");
		await as(DANA).post(`/v1/loans/${gone.loanId}/returned`);
		const no = await as(DANA).post(`/v1/ask-offers/${gone.offerId}/keep`, {
			keep: false,
		});
		expect(no.body).toEqual({ copyId: null, workId: null });
		expect(
			await env.DB.prepare(
				"SELECT state FROM copies WHERE id = (SELECT copy_id FROM ask_offers WHERE id = ?)",
			)
				.bind(gone.offerId)
				.first("state"),
		).toBe("retired");
	});

	it("an offer passed over may still be kept, which lists it", async () => {
		const { id } = await ask();
		const hers = (await offer(id)).body.id;
		const his = (await offer(id, NOA, { name: "Small chainsaw" })).body.id;
		await as(SAM).post(`/v1/asks/${id}/offers/${hers}/take`);

		expect((await as(NOA).get("/v1/me/asks")).body.keep).toEqual([
			expect.objectContaining({ offerId: his, after: "passed" }),
		]);
		const yes = await as(NOA).post(`/v1/ask-offers/${his}/keep`, {
			keep: true,
		});
		expect(yes.status).toBe(200);
		const page = (await as(SAM).get(`/v1/works/${yes.body.workId}`)).body;
		expect(JSON.stringify(page)).toContain("Small chainsaw");
		expect(
			(await as(SAM).post("/v1/loans", { copyId: yes.body.copyId })).status,
		).toBe(201);
	});

	it("closing an ask thanks whoever offered, and an offer can be taken back first", async () => {
		const { id } = await ask();
		const hers = (await offer(id)).body.id;
		await offer(id, NOA, { name: "Small chainsaw" });
		expect(
			(await as(DANA).post(`/v1/ask-offers/${hers}/withdraw`)).status,
		).toBe(204);
		const before = (await sent()).length;
		expect((await as(DANA).post(`/v1/asks/${id}/close`)).status).toBe(404);
		expect((await as(SAM).post(`/v1/asks/${id}/close`)).status).toBe(204);
		expect((await sent()).slice(before)).toEqual([
			expect.objectContaining({ to: "noa@example.com", stage: "sorted" }),
		]);
		expect((await as(SAM).get(`/v1/asks/${id}`)).body.status).toBe("closed");
		expect((await offer(id, DANA)).status).toBe(409);
	});

	it("an ask past its time is over without anyone closing it", async () => {
		const { id } = await ask();
		await offer(id);
		await env.DB.prepare("UPDATE asks SET expires_at = 1 WHERE id = ?")
			.bind(id)
			.run();
		expect((await as(DANA).get("/v1/asks")).body.asks).toEqual([]);
		expect((await as(SAM).get("/v1/me/asks")).body.asks).toEqual([]);
		expect((await as(NOA).get(`/v1/asks/${id}`)).body.status).toBe("closed");
		expect((await offer(id, NOA)).status).toBe(409);
	});

	it("today's ask goes to the phones of members who have one registered, not to their email", async () => {
		await env.DB.prepare(
			`INSERT INTO push_subscriptions (id, member_id, endpoint, p256dh, auth, created_at)
			 VALUES ('01J0PUSH000000000000000001', ?, 'https://push.example/ok', 'key', 'auth', 1)`,
		)
			.bind(DANA)
			.run();
		const before = (await sent()).length;
		await ask();
		await ask({ what: "Ladder", by: "week" });
		expect((await sent()).slice(before)).toEqual([]);
	});

	it("puts a time in its part of the day", () => {
		expect(periodOf("now", "12:00")).toBe("morning");
		expect(periodOf("later", "12:00")).toBe("afternoon");
		expect(periodOf("now", "18:00")).toBe("evening");
		expect(periodOf("later", "09:30")).toBe("morning");
		expect(periodOf("later", "17:00")).toBe("evening");
	});
});
