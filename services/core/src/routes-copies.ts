import { Hono } from "hono";
import {
	UpdateCopy,
	problem,
	traits,
	type CopyDetail,
	type LibraryType,
} from "@cdl/contracts";
import { CLAIMED } from "./sets.ts";
import {
	photosFollowCover,
	readDetails,
	readPhotos,
	thingSearchKey,
} from "./things.ts";
import type { Env } from "./env.ts";
import { viewer, viewerWith } from "./auth.ts";
import { deleteUnusedImages, ownCover } from "./covers.ts";
import { forget, vocabularyKey } from "./cache.ts";
import { searchKey } from "./normalise.ts";
import { denied, json } from "./problem.ts";
import { onCopyAvailable, releaseHolds } from "./waitlist.ts";
import { emit } from "./events.ts";
import { tagsForWork } from "./tags.ts";

/** Owner-only: read, edit, and remove one of my copies. */
export const copies = new Hono<{ Bindings: Env }>();

copies.get("/v1/copies/:id", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:read");
	if (!member) return denied(c, forbidden);
	const detail = await load(c.env, c.req.param("id"), member.id);
	if (!detail) return json(c, problem(404, "Not your copy"));
	return c.json(detail);
});

copies.patch("/v1/copies/:id", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");
	const detail = await load(c.env, id, member.id, false);
	if (!detail) return json(c, problem(404, "Not your copy"));

	const parsed = UpdateCopy.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid copy"));
	const body = parsed.data;

	// Pausing or retiring a book someone is waiting for is a conversation, not a toggle.
	if (detail.openLoan && body.lending && body.lending !== "lendable") {
		return json(
			c,
			problem(409, "Loan in progress", "Settle the open loan first"),
		);
	}
	// A shared edition's cover is everybody's: it can be given one when it has
	// none, but not swapped by one owner of many.
	if (body.coverUrl && !detail.editable.details && detail.edition.coverUrl) {
		return json(
			c,
			problem(409, "Shared edition", "Other members list this edition too"),
		);
	}
	if ((body.title || body.authors) && !detail.editable.details) {
		return json(
			c,
			problem(409, "Shared book", "Other members list this book too"),
		);
	}

	// Details and quantities are a thing's; a book has neither.
	if (
		body.details !== undefined ||
		body.quantity !== undefined ||
		body.photos !== undefined
	) {
		const library = await c.env.DB.prepare(
			"SELECT type FROM communities WHERE id = ?",
		)
			.bind(member.communityId)
			.first<{ type: string }>();
		if (!library || !traits(library.type as LibraryType).details)
			return json(c, problem(422, "A book has no details or quantity"));
	}

	const statements = [];
	const sets: string[] = [];
	const binds: unknown[] = [];
	if (body.condition) (sets.push("condition = ?"), binds.push(body.condition));
	if (body.lending) (sets.push("lending = ?"), binds.push(body.lending));
	if (body.relayAllowed !== undefined)
		(sets.push("relay_allowed = ?"), binds.push(body.relayAllowed ? 1 : 0));
	if (body.loanDays !== undefined)
		(sets.push("loan_days = ?"), binds.push(body.loanDays));
	if (body.note !== undefined)
		(sets.push("note = ?"), binds.push(body.note || null));
	// A thing's own details and how many there are; neither while it is out.
	if (body.quantity !== undefined && body.quantity !== detail.quantity) {
		if (detail.openLoan)
			return json(
				c,
				problem(409, "Loan in progress", "Settle the open loan first"),
			);
		sets.push("quantity = ?");
		binds.push(body.quantity);
		// A set comes back to its owner; it is never passed straight on.
		if (body.quantity > 1) sets.push("relay_allowed = 0");
	}
	// A thing's photos, replaced whole; the first is also its edition's
	// picture, which listings show (a thing's edition is its own).
	if (body.photos !== undefined) {
		const photos: string[] = [];
		for (const url of body.photos) {
			const own = await ownCover(c.env, url);
			if (!own)
				return json(
					c,
					problem(422, "Invalid photo", "Could not take that image"),
				);
			photos.push(own);
		}
		sets.push("photos = ?");
		binds.push(photos.length ? JSON.stringify(photos) : null);
		statements.push(
			c.env.DB.prepare("UPDATE editions SET cover_url = ? WHERE id = ?").bind(
				photos[0] ?? null,
				detail.edition.id,
			),
		);
	}
	if (body.details !== undefined) {
		const details =
			body.details && Object.keys(body.details).length ? body.details : null;
		sets.push("details = ?", "search_key = ?");
		binds.push(
			details ? JSON.stringify(details) : null,
			thingSearchKey(body.title ?? detail.edition.title, details),
		);
	}
	if (sets.length) {
		statements.push(
			c.env.DB.prepare(
				`UPDATE copies SET ${sets.join(", ")} WHERE id = ?`,
			).bind(...binds, id),
		);
	}
	if (body.coverUrl) {
		// The address is where to find the image, not where to leave it.
		const coverUrl = await ownCover(c.env, body.coverUrl);
		if (!coverUrl)
			return json(
				c,
				problem(422, "Invalid cover", "Could not take that image"),
			);
		statements.push(
			c.env.DB.prepare("UPDATE editions SET cover_url = ? WHERE id = ?").bind(
				coverUrl,
				detail.edition.id,
			),
		);
		// A thing's picture is the first of its photos: one photo given alone
		// takes that place and keeps the rest.
		if (body.photos === undefined)
			statements.push(photosFollowCover(c.env, detail.edition.id, coverUrl));
	}
	if (body.title || body.authors) {
		const title = body.title ?? detail.edition.title;
		const authors = body.authors ?? detail.work.authors;
		const key = searchKey(`${title} ${authors.join(" ")}`);
		statements.push(
			c.env.DB.prepare(
				"UPDATE editions SET title = ?, search_key = ? WHERE id = ?",
			).bind(title, key, detail.edition.id),
			c.env.DB.prepare(
				"UPDATE works SET title = ?, authors = ?, search_key = ? WHERE id = ?",
			).bind(title, JSON.stringify(authors), key, detail.work.id),
		);
	}
	// Paused or kept for reference: whoever it was held for keeps their place.
	if (body.lending && body.lending !== "lendable")
		statements.push(releaseHolds(c.env, id));
	if (statements.length) await c.env.DB.batch(statements);
	if (body.lending === "lendable" && detail.lending !== "lendable") {
		c.executionCtx.waitUntil(
			onCopyAvailable(c.env, id).catch((error: unknown) =>
				console.error("[waitlist] offer failed", id, error),
			),
		);
	}
	return c.body(null, 204);
});

/** Remove from the shelf. Hard delete when the copy never went anywhere; retire otherwise. */
copies.delete("/v1/copies/:id", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const id = c.req.param("id");
	const detail = await load(c.env, id, member.id, false);
	if (!detail) return json(c, problem(404, "Not your copy"));
	if (detail.openLoan)
		return json(
			c,
			problem(409, "Loan in progress", "Settle the open loan first"),
		);

	const history = await c.env.DB.prepare(
		"SELECT count(*) AS n FROM loans WHERE copy_id = ?",
	)
		.bind(id)
		.first<{ n: number }>();

	// Resolved before the row can go: a deleted copy is a retired one to everyone else.
	await emit(c.env, c.executionCtx, "copy.retired", { copyId: id });
	if (history?.n) {
		await c.env.DB.batch([
			c.env.DB.prepare("UPDATE copies SET state = 'retired' WHERE id = ?").bind(
				id,
			),
			releaseHolds(c.env, id),
		]);
	} else {
		const [, , , edition] = await c.env.DB.batch([
			// A hold on this copy passes to the next one, if any (waitlist.ts on the next listing).
			releaseHolds(c.env, id),
			c.env.DB.prepare("DELETE FROM copy_shares WHERE copy_id = ?").bind(id),
			c.env.DB.prepare("DELETE FROM copies WHERE id = ?").bind(id),
			// A hand-typed edition nothing else uses goes with its copy: it held
			// only a title and a picture, and listing the book again makes a
			// fresh one. An ISBN's edition is the catalogue's, and stays.
			c.env.DB.prepare(
				`DELETE FROM editions WHERE id = ?1 AND isbn13 IS NULL
				   AND NOT EXISTS (SELECT 1 FROM copies WHERE edition_id = ?1)`,
			).bind(detail.edition.id),
		]);
		// Its pictures too, unless another edition or copy shows the same one.
		c.executionCtx.waitUntil(
			deleteUnusedImages(c.env, [
				...detail.photos,
				edition?.meta.changes ? detail.edition.coverUrl : null,
			]).catch((error: unknown) =>
				console.error("[copies] images not deleted", error),
			),
		);
	}
	await forget(c.env, vocabularyKey(member.communityId));
	return c.body(null, 204);
});

/**
 * The copy as its owner sees it. Writers never show the tags, so they may
 * skip that lookup.
 */
async function load(
	env: Env,
	id: string,
	ownerId: string,
	withTags = true,
): Promise<CopyDetail | null> {
	const row = await env.DB.prepare(
		`SELECT c.id, c.state, c.condition, c.lending, c.relay_allowed, c.loan_days, c.note, c.created_at,
		        c.details, c.quantity, c.photos, ${CLAIMED} AS claimed,
		        e.id AS edition_id, e.work_id, e.isbn13, e.title AS edition_title, e.publisher,
		        e.published_year, e.language, e.page_count, e.cover_url,
		        w.title AS work_title, w.authors, w.created_at AS work_created_at, w.note AS work_note,
		        -- The title and authors are the work's, which every edition of it
		        -- shares: editable only by whoever lists every copy of it.
		        (SELECT count(*) FROM copies o JOIN editions oe ON oe.id = o.edition_id
		          WHERE oe.work_id = e.work_id AND o.owner_id != ? AND o.state != 'retired') AS others,
		        (SELECT id FROM loans l WHERE l.copy_id = c.id
		           AND l.status IN ('requested', 'accepted', 'active') LIMIT 1) AS loan_id,
		        (SELECT status FROM loans l WHERE l.copy_id = c.id
		           AND l.status IN ('requested', 'accepted', 'active') LIMIT 1) AS loan_status,
		        -- Only loans that actually started count as a reading; a request
		        -- somebody withdrew is not one.
		        (SELECT count(*) FROM loans l
		          WHERE l.copy_id = c.id AND l.started_at IS NOT NULL) AS loans,
		        (SELECT max(started_at) FROM loans l
		          WHERE l.copy_id = c.id AND l.started_at IS NOT NULL) AS last_loan_at,
		        (SELECT count(DISTINCT l.borrower_id) FROM loans l
		          WHERE l.copy_id = c.id AND l.started_at IS NOT NULL) AS readers,
		        (SELECT coalesce(sum(coalesce(l.closed_at, unixepoch()) - l.started_at), 0)
		           FROM loans l WHERE l.copy_id = c.id AND l.started_at IS NOT NULL) AS seconds_out
		   FROM copies c
		   JOIN editions e ON e.id = c.edition_id
		   JOIN works w ON w.id = e.work_id
		  WHERE c.id = ? AND c.owner_id = ? AND c.state != 'retired'`,
	)
		.bind(ownerId, id, ownerId)
		.first<DetailRow>();
	if (!row) return null;

	return {
		id: row.id,
		state: row.state,
		condition: row.condition,
		lending: row.lending,
		relayAllowed: row.relay_allowed === 1,
		loanDays: row.loan_days,
		note: row.note,
		quantity: row.quantity,
		free: row.quantity > 1 ? Math.max(0, row.quantity - row.claimed) : null,
		details: readDetails(row.details),
		photos: readPhotos(row.photos),
		createdAt: row.created_at,
		edition: {
			id: row.edition_id,
			workId: row.work_id,
			isbn13: row.isbn13,
			title: row.edition_title,
			publisher: row.publisher,
			publishedYear: row.published_year,
			language: row.language,
			pageCount: row.page_count,
			coverUrl: row.cover_url,
		},
		work: {
			id: row.work_id,
			title: row.work_title,
			authors: JSON.parse(row.authors) as string[],
			createdAt: row.work_created_at,
			tags: withTags ? await tagsForWork(env, row.work_id) : [],
			note: row.work_note,
		},
		editable: { details: row.others === 0 },
		openLoan: row.loan_id
			? { id: row.loan_id, status: row.loan_status ?? "" }
			: null,
		stats: {
			addedAt: row.created_at,
			loans: row.loans,
			lastLoanAt: row.last_loan_at,
			readers: row.readers,
			daysOut: Math.floor(row.seconds_out / 86_400),
		},
	};
}

interface DetailRow {
	id: string;
	state: CopyDetail["state"];
	condition: CopyDetail["condition"];
	lending: CopyDetail["lending"];
	relay_allowed: number;
	loan_days: number | null;
	note: string | null;
	details: string | null;
	quantity: number;
	claimed: number;
	photos: string | null;
	created_at: number;
	loans: number;
	last_loan_at: number | null;
	readers: number;
	seconds_out: number;
	edition_id: string;
	work_id: string;
	isbn13: string | null;
	edition_title: string;
	publisher: string | null;
	published_year: number | null;
	language: string | null;
	page_count: number | null;
	cover_url: string | null;
	work_title: string;
	work_note: string | null;
	authors: string;
	work_created_at: number;
	others: number;
	loan_id: string | null;
	loan_status: string | null;
}
