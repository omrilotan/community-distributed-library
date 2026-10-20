import type {
	CopyListing,
	ListingSort,
	Tag,
	TagMatch,
	WorkListing,
} from "@cdl/contracts";
import { CLAIMED, OWNER_OUT } from "./sets.ts";
import { readDetails, readPhotos } from "./things.ts";
import type { Env } from "./env.ts";
import type { Viewer } from "./auth.ts";
import { boundingBox, coarseDistanceM, distanceM } from "./geo.ts";
import { containing, searchKey } from "./normalise.ts";
import { tagConditions, tagsForWorks } from "./tags.ts";
import { now } from "./ids.ts";

/**
 * One query shape for everything that shows other people's copies: search,
 * the storefront, and a work page. The viewer never sees coordinates — only
 * a label and a rounded distance (decision 0017).
 */
export interface ListingQuery {
	text?: string | undefined;
	workId?: string | undefined;
	/** Only these works: the copies behind a page of books chosen already. */
	workIds?: string[] | undefined;
	/** Metres from the viewer; ignored when the viewer has no area. */
	within?: number | undefined;
	/** Include the viewer's own copies (work page) or hide them (search, browse). */
	includeOwn?: boolean | undefined;
	/** Include books the viewer marked as read; left out of browse and search. */
	includeRead?: boolean | undefined;
	/** Only books on the viewer's wishlist. */
	wished?: boolean | undefined;
	/** Only this member's copies. */
	ownerId?: string | undefined;
	/** Only copies that can be requested right now. */
	availableOnly?: boolean | undefined;
	/** Order of the grouped listing; per-copy order inside a book is fixed. */
	sort?: ListingSort | undefined;
	/** Curated tags on the work; see contracts/tags.ts for the match rules. */
	tags?: Tag[] | undefined;
	match?: TagMatch | undefined;
	limit: number;
	offset?: number | undefined;
}

export interface ListingPage {
	results: CopyListing[];
	/** Rows the query consumed, so the caller can advance the cursor honestly. */
	consumed: number;
}

export async function listCopies(
	env: Env,
	viewer: Viewer,
	query: ListingQuery,
): Promise<CopyListing[]> {
	return (await listPage(env, viewer, query)).results;
}

/**
 * The same query, with the cursor. Distance is filtered in JS after the fact,
 * so "rows read" and "rows returned" differ; paging on the second number skips
 * whatever was dropped and shows it again on the next page.
 */
/** The FROM every listing reads: a copy, its edition, work, owner and share. */
const FROM = `FROM copies c
		   JOIN editions e ON e.id = c.edition_id
		   JOIN works w ON w.id = e.work_id
		   JOIN members m ON m.id = c.owner_id
		   JOIN copy_shares cs ON cs.copy_id = c.id`;

/** The ORDER every listing reads in: own copies last, free first, newest first. */
const ORDER = `ORDER BY (c.owner_id = ?) ASC, (c.state = 'shelved' AND c.lending = 'lendable') DESC,
		           -- ULIDs sort by creation, and break ties that created_at cannot:
		           -- without this, two copies listed in the same second can swap
		           -- between queries and a book shows up on two pages.
		           c.created_at DESC, c.id DESC`;

/** Which copies a query matches, as a WHERE clause and its values. */
function matching(
	viewer: Viewer,
	query: Omit<ListingQuery, "limit" | "offset">,
): { where: string; binds: unknown[] } {
	const conditions = [
		"cs.community_id = ?",
		"m.deactivated_at IS NULL",
		// A suspended member lends nothing until the moderators say otherwise.
		`EXISTS (SELECT 1 FROM memberships om WHERE om.member_id = c.owner_id
		          AND om.community_id = cs.community_id AND om.status = 'active')`,
		"c.state != 'retired'",
	];
	const binds: unknown[] = [viewer.communityId];

	if (query.availableOnly)
		conditions.push(
			"c.state = 'shelved'",
			"c.lending = 'lendable'",
			"(m.away_until IS NULL OR m.away_until <= unixepoch())",
			`(m.lend_limit IS NULL OR m.lend_limit > ${OWNER_OUT})`,
			// A set is available while some of it is free.
			`(c.quantity = 1 OR c.quantity > ${CLAIMED})`,
		);
	if (!query.includeOwn) {
		conditions.push("c.owner_id != ?");
		binds.push(viewer.id);
	}
	if (!query.includeRead) {
		conditions.push(
			"NOT EXISTS (SELECT 1 FROM read_works r WHERE r.member_id = ? AND r.work_id = e.work_id)",
		);
		binds.push(viewer.id);
	}

	if (query.wished) {
		conditions.push(
			"EXISTS (SELECT 1 FROM wishlist wl WHERE wl.member_id = ? AND wl.work_id = e.work_id)",
		);
		binds.push(viewer.id);
	}
	if (query.workId) {
		conditions.push("e.work_id = ?");
		binds.push(query.workId);
	}
	if (query.workIds) {
		conditions.push("e.work_id IN (SELECT value FROM json_each(?))");
		binds.push(JSON.stringify(query.workIds));
	}
	if (query.ownerId) {
		conditions.push("c.owner_id = ?");
		binds.push(query.ownerId);
	}
	if (query.text) {
		const key = containing(searchKey(query.text));
		// A thing is found by its brand and model too (copies.search_key).
		conditions.push(
			"(w.search_key LIKE ? ESCAPE '\\' OR e.search_key LIKE ? ESCAPE '\\' OR c.search_key LIKE ? ESCAPE '\\')",
		);
		binds.push(key, key, key);
	}
	if (query.tags?.length) {
		const filter = tagConditions(query.tags, query.match);
		conditions.push(...filter.sql);
		binds.push(...filter.binds);
	}
	if (query.within && viewer.area) {
		// Owners who never set an area still count; they just have no distance.
		const box = boundingBox(viewer.area, query.within);
		conditions.push(
			"(m.area_lat IS NULL OR (m.area_lat BETWEEN ? AND ? AND m.area_lng BETWEEN ? AND ?))",
		);
		binds.push(box.latMin, box.latMax, box.lngMin, box.lngMax);
	}
	return { where: conditions.join(" AND "), binds };
}

export async function listPage(
	env: Env,
	viewer: Viewer,
	query: ListingQuery,
): Promise<ListingPage> {
	const { where, binds } = matching(viewer, query);
	const { results } = await env.DB.prepare(
		`SELECT c.id, c.state, c.lending, c.condition, c.relay_allowed, c.note, c.owner_id,
		        c.details, c.quantity, c.photos, ${CLAIMED} AS claimed,
		        e.id AS edition_id, e.work_id, e.isbn13, e.title AS edition_title, e.publisher,
		        e.published_year, e.language, e.page_count, e.cover_url,
		        w.title AS work_title, w.authors, w.created_at AS work_created_at, w.note AS work_note,
		        m.display_name, m.area_label, m.area_lat, m.area_lng, m.lend_limit, m.away_until,
		        ${OWNER_OUT} AS owner_out
		   ${FROM}
		  WHERE ${where}
		  ${ORDER}
		  LIMIT ? OFFSET ?`,
	)
		// Own copies sort last when they are shown at all: the shelf is for
		// those. Over-fetch so the exact-distance filter below fills the page.
		.bind(...binds, viewer.id, query.limit * 2, query.offset ?? 0)
		.all<Row>();

	const near = results
		.map((row) => ({ row, metres: metresBetween(viewer, row) }))
		.filter(
			({ metres }) =>
				!query.within || metres === null || metres <= query.within,
		);
	const page = near.slice(0, query.limit);
	// Rows read to produce this page: everything up to the last one kept.
	const consumed =
		page.length === near.length
			? results.length
			: results.indexOf(page[page.length - 1]!.row) + 1;

	const tags = await tagsForWorks(
		env,
		page.map(({ row }) => row.work_id),
	);
	return {
		results: page.map(({ row, metres }) =>
			listing(row, metres, tags.get(row.work_id) ?? [], viewer.compact),
		),
		consumed,
	};
}

function metresBetween(
	viewer: Viewer,
	row: { area_lat: number | null; area_lng: number | null },
): number | null {
	if (!viewer.area || row.area_lat === null || row.area_lng === null)
		return null;
	return distanceM(viewer.area, { lat: row.area_lat, lng: row.area_lng });
}

export function listing(
	row: Row,
	metres: number | null,
	tags: Tag[] = [],
	/** Everyone close by: where anybody lives is nobody's business here. */
	compact = false,
): CopyListing {
	// At their limit, an owner keeps their books listed but cannot take another on.
	const atLimit =
		row.lend_limit != null && (row.owner_out ?? 0) >= row.lend_limit;
	// Away is the same shape: the book is on the shelf, its owner is not here.
	const away = row.away_until != null && row.away_until > now();
	// A set: how many are not asked for or out.
	const quantity = row.quantity ?? 1;
	const free = quantity > 1 ? Math.max(0, quantity - (row.claimed ?? 0)) : null;
	return {
		id: row.id,
		state: row.state,
		lending: row.lending,
		available:
			row.state === "shelved" &&
			row.lending === "lendable" &&
			!atLimit &&
			!away &&
			free !== 0,
		ownerAtLimit: atLimit,
		ownerAway: away,
		ownerBackOn: away ? (row.away_until ?? null) : null,
		condition: row.condition,
		relayAllowed: row.relay_allowed === 1,
		note: row.note,
		quantity,
		free,
		details: readDetails(row.details ?? null),
		photos: readPhotos(row.photos),
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
			tags,
			note: row.work_note,
		},
		owner: {
			id: row.owner_id,
			displayName: row.display_name,
			area: compact
				? { label: "", distanceM: null, approx: null }
				: {
						label: row.area_label ?? "",
						distanceM: metres === null ? null : coarseDistanceM(metres),
						approx:
							row.area_lat !== null && row.area_lng !== null
								? { lat: row.area_lat, lng: row.area_lng }
								: null,
					},
		},
	};
}

export interface Row {
	id: string;
	state: CopyListing["state"];
	lending: CopyListing["lending"];
	condition: CopyListing["condition"];
	relay_allowed: number;
	note: string | null;
	details?: string | null;
	quantity?: number;
	claimed?: number;
	photos?: string | null;
	owner_id: string;
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
	display_name: string;
	area_label: string | null;
	area_lat: number | null;
	area_lng: number | null;
	lend_limit?: number | null;
	away_until?: number | null;
	owner_out?: number | null;
}

/**
 * The same listing, one entry per book rather than per copy. In a community
 * this size the same title sits on several shelves; the storefront shows it
 * once, and inside it the copies are ordered by distance, because who you ask
 * is decided by who is nearest and who you know.
 *
 * In two passes: which books, in what order, over every matching copy but
 * reading only what ordering needs; then the full copies of this page's
 * books. Ordering books by their nearest copy is not expressible in SQL here.
 */

export async function listWorks(
	env: Env,
	viewer: Viewer,
	query: Omit<ListingQuery, "limit" | "offset"> & {
		limit: number;
		offset?: number | undefined;
	},
): Promise<{
	results: WorkListing[];
	/** Books matching, not copies: what the page says it is a page of. */
	total: number;
	nextOffset: number | null;
}> {
	// 1. Every match, lightly: what orders the books, and how many there are.
	const { where, binds } = matching(viewer, query);
	const { results: matches } = await env.DB.prepare(
		`SELECT e.work_id, w.title AS work_title, m.area_lat, m.area_lng,
		        (c.state = 'shelved' AND c.lending = 'lendable'
		         AND (m.away_until IS NULL OR m.away_until <= unixepoch())
		         AND (m.lend_limit IS NULL OR m.lend_limit > ${OWNER_OUT})
		         AND (c.quantity = 1 OR c.quantity > ${CLAIMED})) AS available
		   ${FROM}
		  WHERE ${where}
		  ${ORDER}`,
	)
		.bind(...binds, viewer.id)
		.all<{
			work_id: string;
			work_title: string;
			area_lat: number | null;
			area_lng: number | null;
			available: number;
		}>();
	const books = new Map<
		string,
		{ title: string; nearestM: number | null; availableNearestM: number | null }
	>();
	for (const match of matches) {
		const metres = metresBetween(viewer, match);
		if (query.within && metres !== null && metres > query.within) continue;
		const book = books.get(match.work_id) ?? {
			title: match.work_title,
			nearestM: null,
			availableNearestM: null,
		};
		const nearer = (than: number | null) =>
			metres !== null && (than === null || metres < than);
		if (nearer(book.nearestM)) book.nearestM = metres;
		if (match.available === 1 && nearer(book.availableNearestM))
			book.availableNearestM = metres;
		books.set(match.work_id, book);
	}
	const order = sortedIds(books, query.sort);
	const offset = query.offset ?? 0;
	const pageIds = order.slice(offset, offset + query.limit);
	if (pageIds.length === 0)
		return { results: [], total: order.length, nextOffset: null };

	// 2. This page's books, whole.
	const { results } = await listPage(env, viewer, {
		...query,
		workIds: pageIds,
		limit: 2000,
		offset: 0,
	});

	const byWork = new Map<string, CopyListing[]>();
	for (const copy of results) {
		byWork.set(copy.work.id, [...(byWork.get(copy.work.id) ?? []), copy]);
	}

	const grouped = [...byWork.values()].map((copies) => {
		// Nearest first; a copy that can be borrowed today outranks one that cannot.
		const ordered = [...copies].sort((a, b) => {
			if (a.available !== b.available) return a.available ? -1 : 1;
			const left = a.owner.area.distanceM;
			const right = b.owner.area.distanceM;
			if (left === right) return 0;
			if (left === null) return 1;
			if (right === null) return -1;
			return left - right;
		});
		const first = ordered[0]!;
		// The fullest edition: a cover and an ISBN beat a bare title.
		const edition = ordered
			.map((copy) => copy.edition)
			.reduce((best, next) => (score(next) > score(best) ? next : best));
		return {
			work: first.work,
			edition,
			copies: ordered.map((copy) => ({
				id: copy.id,
				state: copy.state,
				lending: copy.lending,
				available: copy.available,
				ownerAtLimit: copy.ownerAtLimit,
				ownerAway: copy.ownerAway,
				ownerBackOn: copy.ownerBackOn,
				relayAllowed: copy.relayAllowed,
				condition: copy.condition,
				note: copy.note,
				quantity: copy.quantity,
				free: copy.free,
				details: copy.details,
				photos: copy.photos,
				mine: copy.owner.id === viewer.id,
				owner: copy.owner,
			})),
			available: ordered.filter((copy) => copy.available).length,
			nearestM:
				ordered.find((copy) => copy.owner.area.distanceM !== null)?.owner.area
					.distanceM ?? null,
		} satisfies WorkListing;
	});

	const place = new Map(pageIds.map((id, index) => [id, index]));
	const page = grouped.sort(
		(a, b) => (place.get(a.work.id) ?? 0) - (place.get(b.work.id) ?? 0),
	);
	return {
		results: page,
		total: order.length,
		nextOffset:
			offset + query.limit < order.length ? offset + query.limit : null,
	};
}

/**
 * `new` is the order the query came back in — newest copy first — and is what
 * a member sees without asking for anything. `title` is A to Z in Hebrew and
 * English alike; `distance` goes by the nearest copy, one that can be asked
 * for today before one that cannot, as inside a book.
 */
function sortedIds(
	books: Map<
		string,
		{ title: string; nearestM: number | null; availableNearestM: number | null }
	>,
	sort: ListingSort | undefined,
): string[] {
	const ids = [...books.keys()];
	if (sort === "title") {
		// Hebrew and English on one shelf: compare in both, digits as numbers.
		const compare = new Intl.Collator(["he", "en"], { numeric: true }).compare;
		return ids.sort((a, b) =>
			compare(books.get(a)!.title, books.get(b)!.title),
		);
	}
	if (sort === "distance") {
		const nearest = (id: string) =>
			books.get(id)!.availableNearestM ?? books.get(id)!.nearestM;
		// A book nobody has placed has no distance; those go last.
		return ids.sort((a, b) => {
			const left = nearest(a);
			const right = nearest(b);
			if (left === right) return 0;
			if (left === null) return 1;
			if (right === null) return -1;
			return left - right;
		});
	}
	return ids;
}

function score(edition: CopyListing["edition"]): number {
	return (edition.coverUrl ? 2 : 0) + (edition.isbn13 ? 1 : 0);
}
