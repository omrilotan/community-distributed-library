import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
	AddCopyRequest,
	LibraryType,
	type ThingDetails,
	CoverFromUrl,
	SearchRequest,
	TagMatch,
	openapiDocument,
	parseTags,
	problem,
	traits,
	type Problem,
} from "@cdl/contracts";
import { theLibrary } from "./library.ts";
import type { Env } from "./env.ts";
import { searchKey } from "./normalise.ts";
import { viewer, viewerWith } from "./auth.ts";
import { createThingEntry, resolveEdition } from "./catalogue.ts";
import { searchCopies } from "./search.ts";
import {
	ownCover,
	readCover,
	storeCover,
	storeCoverFromUrl,
} from "./covers.ts";
import { auth } from "./routes-auth.ts";
import { publicRoutes } from "./routes-public.ts";
import { admin } from "./routes-admin.ts";
import { catalogue } from "./routes-catalogue.ts";
import { loans } from "./routes-loans.ts";
import { copies } from "./routes-copies.ts";
import { tokens } from "./routes-tokens.ts";
import { handoffs } from "./routes-handoffs.ts";
import { waitlist } from "./routes-waitlist.ts";
import { contact } from "./routes-contact.ts";
import { reports } from "./routes-reports.ts";
import { webhooks } from "./routes-webhooks.ts";
import { wanted } from "./routes-wanted.ts";
import { push } from "./routes-push.ts";
import { places } from "./routes-places.ts";
import { duplicates } from "./routes-duplicates.ts";
import { tags as tagRoutes } from "./routes-tags.ts";
import { addWorkTags, languageTag } from "./tags.ts";
import { emit } from "./events.ts";
import { onCopyAvailable } from "./waitlist.ts";
import { forget, vocabularyKey } from "./cache.ts";
import { denied, json } from "./problem.ts";
import { ulid, now } from "./ids.ts";
import { linkWork, NAMESPACE_FOR_LIBRARY } from "./community-catalogue.ts";
import { readDetails, thingSearchKey } from "./things.ts";
import { CLAIMED } from "./sets.ts";
import { privacy } from "./routes-privacy.ts";
import { reading } from "./routes-reading.ts";
import { assistantLimits } from "./assistant-limits.ts";

export const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Development and tests only: switch what the local library lends, so the
 * browser tests can run a library of things too. A real library's type is
 * fixed when it opens; this route does not exist without DEV_AUTH.
 */
app.post("/v1/dev/library-type", async (c) => {
	if (c.env.DEV_AUTH !== "true") return json(c, problem(404, "Not found"));
	const body = (await c.req.json().catch(() => null)) as {
		type?: string;
	} | null;
	const parsed = LibraryType.safeParse(body?.type);
	if (!parsed.success) return json(c, problem(422, "Unknown type"));
	await c.env.DB.prepare("UPDATE communities SET type = ?")
		.bind(parsed.data)
		.run();
	return c.body(null, 204);
});

/** Public: the API described by itself. Generated from contracts on each call. */
app.get("/v1/openapi.json", async (c) =>
	c.json(
		openapiDocument({
			serverUrl: `${c.env.APP_URL}/api`,
			title: (await theLibrary(c.env)).name,
		}),
	),
);
// Before any route: an assistant's reach to other people is metered.
app.use("/v1/*", assistantLimits);
app.route("/", auth);
app.route("/", admin);
app.route("/", privacy);
app.route("/", reading);
app.route("/", catalogue);
app.route("/", publicRoutes);
app.route("/", loans);
app.route("/", copies);
app.route("/", tokens);
app.route("/", handoffs);
app.route("/", waitlist);
app.route("/", reports);
app.route("/", contact);
app.route("/", webhooks);
app.route("/", wanted);
app.route("/", push);
app.route("/", places);
app.route("/", duplicates);
app.route("/", tagRoutes);

app.post("/v1/copies", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);

	const parsed = AddCopyRequest.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) {
		return json(c, {
			...problem(422, "Invalid copy"),
			errors: parsed.error.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
		});
	}

	const body = parsed.data;
	// What a library lends decides what an item is: a book, or a thing.
	const library = await c.env.DB.prepare(
		"SELECT type FROM communities WHERE id = ?",
	)
		.bind(member.communityId)
		.first<{ type: LibraryType }>();
	if (!library) return json(c, problem(404, "No such library"));
	// Items that carry their owner's details are things, named and counted.
	const thingShaped = traits(library.type).details !== null;
	if (thingShaped !== Boolean(body.thing))
		return json(
			c,
			problem(
				422,
				"Wrong kind of item",
				thingShaped
					? "This library lends things: give a thing's name"
					: "This library lends books: give an ISBN or a title and authors",
			),
		);
	if (body.thing) return addThing(c, member, body.thing, body);

	// A second Save while the first was still fetching its cover, or a client
	// retrying: the same book from the same member moments apart is one copy.
	const again = await justAdded(c.env, member.id, body);
	if (again) return c.json(again, 201);

	let edition;
	if (body.isbn13) {
		const lookup = await c.env.METADATA.lookup(body.isbn13);
		edition = lookup
			? await resolveEdition(c.env, { kind: "isbn", lookup })
			: body.manual
				? await resolveEdition(c.env, { kind: "manual", ...body.manual })
				: null;
		// No provider knows this ISBN and the member gave nothing to fall back on.
		if (!edition)
			return json(
				c,
				problem(404, "Unknown ISBN", "Add the title and author instead"),
			);
	} else {
		edition = await resolveEdition(c.env, { kind: "manual", ...body.manual! });
	}

	// Checked again now that the edition is resolved: the first request may have
	// finished while this one was fetching its cover.
	const raced = await justAdded(c.env, member.id, body);
	if (raced) {
		await c.env.DB.prepare(
			"DELETE FROM editions WHERE id = ? AND id != ? AND NOT EXISTS (SELECT 1 FROM copies WHERE edition_id = ?)",
		)
			.bind(edition.editionId, raced.editionId, edition.editionId)
			.run();
		return c.json(raced, 201);
	}

	const id = ulid();
	const at = now();
	await c.env.DB.batch([
		c.env.DB.prepare(
			`INSERT INTO copies
			   (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, loan_days, note, created_at)
			 VALUES (?, ?, ?, 'shelved', ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			id,
			edition.editionId,
			member.id,
			member.id,
			body.condition ?? "good",
			body.lending ?? "lendable",
			body.relayAllowed ? 1 : 0,
			body.loanDays ?? null,
			body.note ?? null,
			at,
		),
		c.env.DB.prepare(
			"INSERT INTO copy_shares (copy_id, community_id) VALUES (?, ?)",
		).bind(id, member.communityId),
		linkWork(c.env, edition.workId, member.communityId),
	]);

	// What the provider knew about the language becomes a tag on the book.
	const language = languageTag(
		body.isbn13 ? await editionLanguage(c.env, edition.editionId) : null,
	);
	if (language)
		c.executionCtx.waitUntil(
			addWorkTags(c.env, edition.workId, [language], member.id).catch(
				() => undefined,
			),
		);
	// Someone may have been waiting for exactly this book.
	c.executionCtx.waitUntil(
		onCopyAvailable(c.env, id).catch((error: unknown) =>
			console.error("[waitlist] offer failed", id, error),
		),
	);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.listed", { copyId: id }),
	);
	// One more book behind a tag: the counts on the chips have moved.
	await forget(c.env, vocabularyKey(member.communityId));
	return c.json(
		{ id, editionId: edition.editionId, workId: edition.workId },
		201,
	);
});

/**
 * A thing: its own entry, its details and how many there are on the copy,
 * and its category as a tag on the entry.
 */
async function addThing(
	c: Context<{ Bindings: Env }>,
	member: { id: string; communityId: string },
	thing: {
		name: string;
		quantity: number;
		details?: ThingDetails | undefined;
		photoUrl?: string | undefined;
		photoUrls?: string[] | undefined;
		category?: string | undefined;
	},
	body: {
		condition?: string | undefined;
		lending?: string | undefined;
		relayAllowed?: boolean | undefined;
		loanDays?: number | undefined;
		note?: string | undefined;
	},
) {
	// A category the library has, or none: tags are curated, not free text.
	const category = thing.category
		? await c.env.DB.prepare(
				`SELECT t.slug FROM tags t JOIN tag_namespaces n ON n.id = t.namespace
				  WHERE t.namespace = 'category' AND t.value = ? AND ${NAMESPACE_FOR_LIBRARY}`,
			)
				.bind(thing.category)
				.first<{ slug: string }>()
		: null;
	if (thing.category && !category)
		return json(c, problem(422, "Unknown category"));

	// Every photo is kept in our own bucket; the first is its picture everywhere.
	const photos: string[] = [];
	for (const url of (
		thing.photoUrls ?? (thing.photoUrl ? [thing.photoUrl] : [])
	).slice(0, 4)) {
		const own = await ownCover(c.env, url);
		if (!own)
			return json(
				c,
				problem(422, "Invalid photo", "Could not take that image"),
			);
		photos.push(own);
	}
	const entry = await createThingEntry(c.env, {
		name: thing.name,
		photoUrl: photos[0],
	});
	const id = ulid();
	const at = now();
	const details =
		thing.details && Object.keys(thing.details).length
			? JSON.stringify(thing.details)
			: null;
	await c.env.DB.batch([
		c.env.DB.prepare(
			`INSERT INTO copies
			   (id, edition_id, owner_id, state, holder_id, condition, lending, relay_allowed, loan_days, note,
			    details, quantity, search_key, photos, created_at)
			 VALUES (?, ?, ?, 'shelved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).bind(
			id,
			entry.editionId,
			member.id,
			member.id,
			body.condition ?? "good",
			body.lending ?? "lendable",
			// A set is never passed straight on: it comes back to its owner.
			thing.quantity > 1 ? 0 : body.relayAllowed ? 1 : 0,
			body.loanDays ?? null,
			body.note ?? null,
			details,
			thing.quantity,
			thingSearchKey(thing.name, thing.details),
			photos.length ? JSON.stringify(photos) : null,
			at,
		),
		c.env.DB.prepare(
			"INSERT INTO copy_shares (copy_id, community_id) VALUES (?, ?)",
		).bind(id, member.communityId),
		linkWork(c.env, entry.workId, member.communityId),
	]);
	if (category)
		await addWorkTags(c.env, entry.workId, [category.slug], member.id);
	c.executionCtx.waitUntil(
		emit(c.env, c.executionCtx, "copy.listed", { copyId: id }),
	);
	await forget(c.env, vocabularyKey(member.communityId));
	return c.json({ id, editionId: entry.editionId, workId: entry.workId }, 201);
}

app.post("/v1/covers", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);

	const form = await c.req.formData().catch(() => null);
	const file = form?.get("file");
	if (!file || typeof file === "string") {
		return json(c, problem(422, "Invalid cover", "send a file field"));
	}

	const stored = await storeCover(c.env, file);
	if (!stored.ok) return json(c, problem(422, "Invalid cover", stored.reason));
	return c.json({ coverUrl: stored.coverUrl }, 201);
});

app.post("/v1/covers/from-url", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const parsed = CoverFromUrl.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid URL"));
	const stored = await storeCoverFromUrl(c.env, parsed.data.url);
	if (!stored.ok) return json(c, problem(422, "Invalid cover", stored.reason));
	return c.json({ coverUrl: stored.coverUrl }, 201);
});

app.get("/v1/covers/:key", (c) => readCover(c.env, c.req.param("key")));

app.get("/v1/me/shelf", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:read");
	if (!member) return denied(c, forbidden);

	const { results } = await c.env.DB.prepare(
		`SELECT c.id, c.state, c.condition, c.lending, c.relay_allowed, c.note,
		        c.quantity, c.details, ${CLAIMED} AS claimed,
		        e.title, e.cover_url, w.authors
		   FROM copies c
		   JOIN editions e ON e.id = c.edition_id
		   JOIN works w ON w.id = e.work_id
		  WHERE c.owner_id = ? AND c.state != 'retired'
		  ORDER BY c.created_at DESC`,
	)
		.bind(member.id)
		.all<ShelfRow>();

	return c.json({
		copies: results.map((row) => ({
			id: row.id,
			state: row.state,
			condition: row.condition,
			lending: row.lending,
			relayAllowed: row.relay_allowed === 1,
			note: row.note,
			title: row.title,
			authors: JSON.parse(row.authors) as string[],
			coverUrl: row.cover_url,
			quantity: row.quantity,
			free: row.quantity > 1 ? Math.max(0, row.quantity - row.claimed) : null,
			details: readDetails(row.details),
		})),
	});
});

app.get("/v1/search", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);

	const parsed = SearchRequest.safeParse({
		q: c.req.query("q"),
		within: c.req.query("within") ? Number(c.req.query("within")) : undefined,
		limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
		offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
		sort: c.req.query("sort") || undefined,
		availableOnly: c.req.query("availableOnly") === "1",
		includeOwn: c.req.query("showMine") === "1",
		includeRead: c.req.query("showRead") === "1",
	});
	if (!parsed.success) return json(c, problem(422, "Invalid search"));

	const page = await searchCopies(c.env, member, {
		...parsed.data,
		wished: c.req.query("wished") === "1",
		tags: parseTags(c.req.query("tags")),
		match: TagMatch.catch("facets").parse(c.req.query("match")),
	});
	return c.json({
		results: page.results,
		total: page.total,
		nextOffset: page.nextOffset,
	});
});

app.notFound((c) => json(c, problem(404, "Not found")));

app.onError((error, c) => {
	console.error(error);
	return json(c, problem(500, "Something went wrong"));
});

/** The edition's own language, as the metadata provider reported it. */
async function editionLanguage(env: Env, editionId: string) {
	const row = await env.DB.prepare("SELECT language FROM editions WHERE id = ?")
		.bind(editionId)
		.first<{ language: string | null }>();
	return row?.language ?? null;
}

interface ShelfRow {
	id: string;
	state: string;
	condition: string;
	lending: string;
	relay_allowed: number;
	note: string | null;
	title: string;
	cover_url: string | null;
	authors: string;
	quantity: number;
	details: string | null;
	claimed: number;
}

/** How long the same book from the same member counts as the same Save. */
const SAME_ADD_SECONDS = 120;

/** The copy this member listed moments ago of the same book, if any. */
async function justAdded(
	env: Env,
	ownerId: string,
	body: {
		isbn13?: string | undefined;
		manual?: { title: string; authors: string[] } | undefined;
	},
): Promise<{ id: string; editionId: string; workId: string } | null> {
	const since = now() - SAME_ADD_SECONDS;
	const match = body.isbn13
		? { sql: "e.isbn13 = ?", value: body.isbn13 }
		: body.manual
			? {
					sql: "e.search_key = ?",
					value: searchKey(
						`${body.manual.title} ${body.manual.authors.join(" ")}`,
					),
				}
			: null;
	if (!match) return null;
	return env.DB.prepare(
		`SELECT c.id, e.id AS editionId, e.work_id AS workId
		   FROM copies c JOIN editions e ON e.id = c.edition_id
		  WHERE c.owner_id = ? AND c.state != 'retired' AND c.created_at >= ?
		    AND ${match.sql}
		  ORDER BY c.created_at DESC LIMIT 1`,
	)
		.bind(ownerId, since, match.value)
		.first<{ id: string; editionId: string; workId: string }>();
}
