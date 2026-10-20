import { Hono } from "hono";
import {
	BrowseRequest,
	TagMatch,
	parseTags,
	problem,
	type WorkPage,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { viewer, viewerWith } from "./auth.ts";
import { ownCover } from "./covers.ts";
import { listCopies, listWorks } from "./listings.ts";
import { denied, json } from "./problem.ts";
import { position } from "./waitlist.ts";
import { tagsForWork } from "./tags.ts";
import { now } from "./ids.ts";

export const catalogue = new Hono<{ Bindings: Env }>();

/** The storefront: what can be requested right now, newest first. */
catalogue.get("/v1/browse", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);

	const parsed = BrowseRequest.safeParse({
		owner: c.req.query("owner") || undefined,
		within: c.req.query("within") ? Number(c.req.query("within")) : undefined,
		limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
		offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
		sort: c.req.query("sort") || undefined,
		availableOnly: c.req.query("availableOnly") === "1",
		includeOwn: c.req.query("showMine") === "1",
		includeRead: c.req.query("showRead") === "1",
	});
	if (!parsed.success) return json(c, problem(422, "Invalid request"));
	const {
		owner,
		within,
		limit,
		offset,
		sort,
		availableOnly,
		includeOwn,
		includeRead,
	} = parsed.data;

	// One entry per book: the same title often sits on several shelves here.
	const page = await listWorks(c.env, member, {
		ownerId: owner,
		sort,
		availableOnly,
		// One member's shelf is about distance to them, not to each book.
		...(owner ? {} : { within }),
		limit,
		offset,
		// Somebody looking at their own shelf means it, whatever the default.
		includeOwn: includeOwn || owner === member.id,
		// A neighbour's shelf is theirs to show in full.
		includeRead: includeRead || Boolean(owner),
		// Only what the member keeps to read: a filter like the others.
		wished: c.req.query("wished") === "1",
		tags: parseTags(c.req.query("tags")),
		match: TagMatch.catch("facets").parse(c.req.query("match")),
	});
	return c.json(page);
});

/** ISBN → what we know, for a preview before listing. Cached by the metadata service. */
catalogue.get("/v1/lookup/:isbn", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	const isbn = c.req.param("isbn").replace(/\D/g, "");
	if (isbn.length !== 13) return json(c, problem(422, "Not an ISBN-13"));
	const found = await c.env.METADATA.lookup(isbn);
	if (!found) return json(c, problem(404, "Unknown ISBN"));
	// The preview shows this cover before anybody saves the book, so hand back
	// our own copy of it rather than the provider's address.
	return c.json({ ...found, coverUrl: await ownCover(c.env, found.coverUrl) });
});

/** A book page. Own copies are included and flagged; others carry the viewer's open request. */
catalogue.get("/v1/works/:id", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	const workId = c.req.param("id");

	// One round of reads; a missing book is answered after, not before.
	const [
		work,
		workTags,
		editions,
		copies,
		requests,
		holds,
		mine,
		read,
		wished,
	] = await Promise.all([
		c.env.DB.prepare(
			"SELECT id, title, authors, created_at, note FROM works WHERE id = ?",
		)
			.bind(workId)
			.first<{
				id: string;
				title: string;
				authors: string;
				created_at: number;
				note: string | null;
			}>(),
		tagsForWork(c.env, workId),
		c.env.DB.prepare(
			`SELECT id, work_id, isbn13, title, publisher, published_year, language, page_count, cover_url
			   FROM editions WHERE work_id = ? ORDER BY created_at`,
		)
			.bind(workId)
			.all<EditionRow>(),
		// The book's own page shows every copy, read or not.
		listCopies(c.env, member, {
			workId,
			includeOwn: true,
			includeRead: true,
			limit: 50,
		}),
		c.env.DB.prepare(
			`SELECT l.id, l.copy_id, l.status, l.due_at FROM loans l JOIN copies c ON c.id = l.copy_id
			   JOIN editions e ON e.id = c.edition_id
			  WHERE e.work_id = ? AND l.borrower_id = ? AND l.status IN ('requested', 'accepted', 'active')`,
		)
			.bind(workId, member.id)
			.all<{
				id: string;
				copy_id: string;
				status: "requested" | "accepted" | "active";
				due_at: number | null;
			}>(),
		c.env.DB.prepare(
			`SELECT w.offered_copy_id, w.offer_expires_at, w.member_id FROM waitlist w
			  WHERE w.work_id = ? AND w.community_id = ? AND w.offer_expires_at > ?`,
		)
			.bind(workId, member.communityId, now())
			.all<{
				offered_copy_id: string;
				offer_expires_at: number;
				member_id: string;
			}>(),
		position(c.env, member.id, member.communityId, workId),
		c.env.DB.prepare(
			"SELECT 1 FROM read_works WHERE member_id = ? AND work_id = ?",
		)
			.bind(member.id, workId)
			.first(),
		c.env.DB.prepare(
			"SELECT 1 FROM wishlist WHERE member_id = ? AND work_id = ?",
		)
			.bind(member.id, workId)
			.first(),
	]);
	if (!work) return json(c, problem(404, "No such book"));
	const myLoanByCopy = new Map(
		requests.results.map((row) => [row.copy_id, row]),
	);
	// Held for someone else: not to be asked for. Held for the viewer: theirs.
	const heldUntil = new Map(
		holds.results
			.filter((row) => row.member_id !== member.id)
			.map((row) => [row.offered_copy_id, row.offer_expires_at]),
	);
	const heldForMe = new Map(
		holds.results
			.filter((row) => row.member_id === member.id)
			.map((row) => [row.offered_copy_id, row.offer_expires_at]),
	);

	const page: WorkPage = {
		work: {
			id: work.id,
			title: work.title,
			authors: JSON.parse(work.authors) as string[],
			createdAt: work.created_at,
			tags: workTags,
			note: work.note,
		},
		editions: editions.results.map((row) => ({
			id: row.id,
			workId: row.work_id,
			isbn13: row.isbn13,
			title: row.title,
			publisher: row.publisher,
			publishedYear: row.published_year,
			language: row.language,
			pageCount: row.page_count,
			coverUrl: row.cover_url,
		})),
		// Nearest first, because that is what decides who you ask; your own copy
		// last, since you are not going to borrow from yourself.
		copies: [...copies]
			.sort((a, b) => {
				const mineA = a.owner.id === member.id;
				const mineB = b.owner.id === member.id;
				if (mineA !== mineB) return mineA ? 1 : -1;
				if (a.available !== b.available) return a.available ? -1 : 1;
				const left = a.owner.area.distanceM;
				const right = b.owner.area.distanceM;
				if (left === right) return 0;
				if (left === null) return 1;
				if (right === null) return -1;
				return left - right;
			})
			.map((copy) => ({
				...copy,
				mine: copy.owner.id === member.id,
				myLoanId: myLoanByCopy.get(copy.id)?.id ?? null,
				myLoanStatus: myLoanByCopy.get(copy.id)?.status ?? null,
				myLoanDue: myLoanByCopy.get(copy.id)?.due_at ?? null,
				relayable:
					copy.state === "on_loan" &&
					copy.lending === "lendable" &&
					copy.relayAllowed &&
					copy.owner.id !== member.id,
				heldUntil: heldUntil.get(copy.id) ?? null,
				heldForMe: heldForMe.get(copy.id) ?? null,
			})),
		myWaitlist: mine ? { id: mine.id, position: mine.position } : null,
		read: Boolean(read),
		wished: Boolean(wished),
	};
	return c.json(page);
});

interface EditionRow {
	id: string;
	work_id: string;
	isbn13: string | null;
	title: string;
	publisher: string | null;
	published_year: number | null;
	language: string | null;
	page_count: number | null;
	cover_url: string | null;
}
