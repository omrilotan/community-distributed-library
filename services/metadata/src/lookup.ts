import { MetadataLookup } from "@cdl/contracts";
import {
	providers as allProviders,
	type ProviderEnv,
	type ProviderResult,
} from "./providers.ts";

/** A miss is re-checked after a week; providers do add records over time. */
const MISS_TTL_SECONDS = 7 * 24 * 60 * 60;
/** A record is fetched again after three months: open data gets corrected. */
const HIT_TTL_SECONDS = 90 * 24 * 60 * 60;

/** The little of D1 this needs, so a test can stand in for it. */
export interface LookupDb {
	prepare(query: string): {
		bind(...values: unknown[]): {
			first<T>(): Promise<T | null>;
			run(): Promise<unknown>;
		};
	};
}

type Provider = (isbn13: string, env: ProviderEnv) => Promise<ProviderResult>;

/**
 * What the providers know of an ISBN, remembered for every library: a hit
 * for three months, a miss for a week. A miss is remembered only when every
 * provider answered that it does not know the book: one that was down, slow
 * or out of quota may well know it, so that is no answer at all.
 */
export async function lookup(
	db: LookupDb,
	env: ProviderEnv,
	isbn13: string,
	providers: Provider[] = allProviders,
	now = Math.floor(Date.now() / 1000),
): Promise<MetadataLookup | null> {
	const cached = await db
		.prepare("SELECT payload, fetched_at FROM lookup_cache WHERE isbn13 = ?")
		.bind(isbn13)
		.first<{ payload: string; fetched_at: number }>();
	const kept = cached
		? MetadataLookup.safeParse(JSON.parse(cached.payload))
		: null;
	if (kept?.success && now - cached!.fetched_at < HIT_TTL_SECONDS)
		return kept.data;

	const miss = await db
		.prepare("SELECT fetched_at FROM lookup_misses WHERE isbn13 = ?")
		.bind(isbn13)
		.first<{ fetched_at: number }>();
	if (!kept?.success && miss && now - miss.fetched_at < MISS_TTL_SECONDS)
		return null;

	let unanswered = false;
	for (const provider of providers) {
		const result = await provider(isbn13, env).catch(
			(): "unavailable" => "unavailable",
		);
		if (result === "unavailable") {
			unanswered = true;
			continue;
		}
		if (!result) continue;
		// Open data can be wrong or odd: only what fits the record is kept.
		const record = MetadataLookup.safeParse(tidy(result));
		if (!record.success) continue;
		await db
			.prepare(
				"INSERT OR REPLACE INTO lookup_cache (isbn13, source, payload, fetched_at) VALUES (?, ?, ?, ?)",
			)
			.bind(isbn13, record.data.source, JSON.stringify(record.data), now)
			.run();
		return record.data;
	}

	// An old record still beats nothing while the providers are away.
	if (kept?.success) return kept.data;
	if (!unanswered)
		await db
			.prepare(
				"INSERT OR REPLACE INTO lookup_misses (isbn13, fetched_at) VALUES (?, ?)",
			)
			.bind(isbn13, now)
			.run();
	return null;
}

/** Empty author names out, and nothing longer than a record should hold. */
function tidy(found: MetadataLookup): MetadataLookup {
	const cut = (value: string, length: number) => value.trim().slice(0, length);
	return {
		...found,
		title: cut(found.title, 300),
		authors: found.authors
			.map((author) => cut(author, 120))
			.filter(Boolean)
			.slice(0, 10),
		publisher: found.publisher ? cut(found.publisher, 200) : null,
	};
}
