import type { MetadataLookup } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { ownCover } from "./covers.ts";
import { ulid, now } from "./ids.ts";
import { searchKey } from "./normalise.ts";

export interface EditionRef {
	editionId: string;
	workId: string;
}

/**
 * One edition per ISBN, one work per title+authors. Deliberately naive: two
 * members listing the same book share an edition, and the same book in a
 * different translation does not.
 */
export async function resolveEdition(
	env: Env,
	input:
		| { kind: "isbn"; lookup: MetadataLookup }
		| {
				kind: "manual";
				title: string;
				authors: string[];
				language?: string | undefined;
				coverUrl?: string | undefined;
		  },
): Promise<EditionRef> {
	const at = now();

	if (input.kind === "isbn") {
		const existing = await env.DB.prepare(
			"SELECT id, work_id FROM editions WHERE isbn13 = ?",
		)
			.bind(input.lookup.isbn13)
			.first<{ id: string; work_id: string }>();
		if (existing) return { editionId: existing.id, workId: existing.work_id };
	}

	const title = input.kind === "isbn" ? input.lookup.title : input.title;
	const authors = input.kind === "isbn" ? input.lookup.authors : input.authors;
	const workId = await findOrCreateWork(env, title, authors, at);
	// Whoever named the cover — a provider lookup or the client — we store our
	// own copy of it rather than the address they gave us.
	const coverUrl = await ownCover(
		env,
		input.kind === "isbn" ? input.lookup.coverUrl : input.coverUrl,
	);

	const editionId = ulid();
	await env.DB.prepare(
		`INSERT INTO editions
		   (id, work_id, isbn13, title, publisher, published_year, language, page_count, cover_url, search_key, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			editionId,
			workId,
			input.kind === "isbn" ? input.lookup.isbn13 : null,
			title,
			input.kind === "isbn" ? input.lookup.publisher : null,
			input.kind === "isbn" ? input.lookup.publishedYear : null,
			input.kind === "isbn" ? input.lookup.language : (input.language ?? null),
			input.kind === "isbn" ? input.lookup.pageCount : null,
			coverUrl,
			searchKey(`${title} ${authors.join(" ")}`),
			at,
		)
		.run();

	return { editionId, workId };
}

/**
 * A thing's own entry: a work of its name and a plain edition beneath it
 * (no ISBN) that carries the photo, so every join through editions keeps
 * working. Never shared with another item of the same name.
 */
export async function createThingEntry(
	env: Env,
	input: { name: string; photoUrl?: string | undefined },
): Promise<EditionRef> {
	const at = now();
	const workId = ulid();
	const editionId = ulid();
	const key = searchKey(input.name);
	const photo = await ownCover(env, input.photoUrl);
	await env.DB.batch([
		env.DB.prepare(
			"INSERT INTO works (id, title, authors, search_key, created_at) VALUES (?, ?, '[]', ?, ?)",
		).bind(workId, input.name, key, at),
		env.DB.prepare(
			`INSERT INTO editions (id, work_id, isbn13, title, cover_url, search_key, created_at)
			 VALUES (?, ?, NULL, ?, ?, ?, ?)`,
		).bind(editionId, workId, input.name, photo, key, at),
	]);
	return { editionId, workId };
}

/**
 * The work a title and authors name, made if nobody has it yet: for asking
 * for a book nobody lists, which needs a work to wait for, not an edition.
 */
export function resolveWork(
	env: Env,
	title: string,
	authors: string[],
): Promise<string> {
	return findOrCreateWork(env, title, authors, now());
}

async function findOrCreateWork(
	env: Env,
	title: string,
	authors: string[],
	now: number,
): Promise<string> {
	const key = searchKey(`${title} ${authors.join(" ")}`);
	const titleKey = searchKey(title);
	const existing = await env.DB.prepare(
		"SELECT id FROM works WHERE search_key = ?",
	)
		.bind(key)
		.first<{ id: string }>();
	if (existing) return existing.id;

	// A book asked for by title alone ("Harry Potter") must meet the copy
	// listed later with its author, and the other way round. Either side
	// without authors matches on the title; the fuller record wins.
	if (authors.length === 0) {
		// The key is the title then the authors' names, so "dune %" also finds
		// "Dune Messiah": only a work whose own title is this one will do, the
		// oldest first. The title is taken literally, % and _ included.
		const { results } = await env.DB.prepare(
			`SELECT id, title FROM works
			  WHERE search_key = ? OR search_key LIKE ? ESCAPE '\\'
			  ORDER BY created_at, id LIMIT 50`,
		)
			.bind(titleKey, `${titleKey.replace(/[\\%_]/g, "\\$&")} %`)
			.all<{ id: string; title: string }>();
		const byTitle = results.find((row) => searchKey(row.title) === titleKey);
		if (byTitle) return byTitle.id;
	} else {
		const titleOnly = await env.DB.prepare(
			"SELECT id FROM works WHERE search_key = ? AND authors = '[]'",
		)
			.bind(titleKey)
			.first<{ id: string }>();
		if (titleOnly) {
			await env.DB.prepare(
				"UPDATE works SET authors = ?, search_key = ? WHERE id = ?",
			)
				.bind(JSON.stringify(authors), key, titleOnly.id)
				.run();
			return titleOnly.id;
		}
	}

	const id = ulid();
	await env.DB.prepare(
		"INSERT INTO works (id, title, authors, search_key, created_at) VALUES (?, ?, ?, ?, ?)",
	)
		.bind(id, title, JSON.stringify(authors), key, now)
		.run();
	return id;
}
