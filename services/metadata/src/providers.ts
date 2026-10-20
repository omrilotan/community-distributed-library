import type { MetadataLookup } from "@cdl/contracts";

/**
 * `null` means the provider answered and does not know the ISBN.
 * `"unavailable"` means it did not answer usefully (network, quota, 5xx) and
 * the miss must not be cached.
 */
export type ProviderResult = MetadataLookup | null | "unavailable";

export interface ProviderEnv {
	GOOGLE_BOOKS_KEY?: string;
}

type Provider = (isbn13: string, env: ProviderEnv) => Promise<ProviderResult>;

/**
 * Open Library first, Google Books second — decision 0003. Google carries
 * noticeably more Hebrew ISBNs, so the fallback is not decorative.
 */
export const providers: Provider[] = [openLibrary, googleBooks];

/**
 * How long a provider gets. A slow one is an unavailable one: the member is
 * waiting to add a book, and can type it in.
 */
const TIMEOUT_MS = 4000;

// Open Library asks callers to identify themselves.
const USER_AGENT = "cdl-metadata/0.0 (community-distributed-library)";

async function openLibrary(isbn13: string): Promise<ProviderResult> {
	const edition = await openLibraryEdition(isbn13);
	if (edition !== null) return edition;
	// The edition endpoint is often empty even for known ISBNs; the search
	// index is work-level but reliable, so fall back to it for the basics.
	return openLibrarySearch(isbn13);
}

async function openLibraryEdition(isbn13: string): Promise<ProviderResult> {
	const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
	const response = await fetch(url, {
		headers: { accept: "application/json", "user-agent": USER_AGENT },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (response.status === 404) return null;
	if (!response.ok) return "unavailable";

	const text = await response.text();
	if (!text.trim()) return null;
	const body = JSON.parse(text) as Record<string, OpenLibraryBook | undefined>;
	const book = body[`ISBN:${isbn13}`];
	if (!book?.title) return null;

	return {
		isbn13,
		title: book.title,
		authors: (book.authors ?? []).map((author) => author.name).filter(Boolean),
		publisher: book.publishers?.[0]?.name ?? null,
		publishedYear: year(book.publish_date),
		language: null,
		pageCount: book.number_of_pages ?? null,
		coverUrl: book.cover?.medium ?? null,
		source: "openlibrary",
	};
}

async function openLibrarySearch(isbn13: string): Promise<ProviderResult> {
	const url =
		`https://openlibrary.org/search.json?isbn=${isbn13}&limit=1` +
		"&fields=title,author_name,first_publish_year,cover_i";
	const response = await fetch(url, {
		headers: { accept: "application/json", "user-agent": USER_AGENT },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!response.ok) return "unavailable";

	const body = (await response.json()) as { docs?: OpenLibraryDoc[] };
	const doc = body.docs?.[0];
	if (!doc?.title) return null;

	return {
		isbn13,
		title: doc.title,
		authors: doc.author_name ?? [],
		// Work-level data: publisher and page count vary per edition, so leave them.
		publisher: null,
		publishedYear: doc.first_publish_year ?? null,
		language: null,
		pageCount: null,
		coverUrl: doc.cover_i
			? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
			: null,
		source: "openlibrary",
	};
}

async function googleBooks(
	isbn13: string,
	env: ProviderEnv,
): Promise<ProviderResult> {
	// Anonymous quota is shared and often exhausted; a key is a per-project quota.
	const key = env.GOOGLE_BOOKS_KEY ? `&key=${env.GOOGLE_BOOKS_KEY}` : "";
	const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}${key}`;
	const response = await fetch(url, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!response.ok) return "unavailable";

	const body = (await response.json()) as {
		items?: { volumeInfo?: GoogleVolume }[];
	};
	const info = body.items?.[0]?.volumeInfo;
	if (!info?.title) return null;

	return {
		isbn13,
		title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
		authors: info.authors ?? [],
		publisher: info.publisher ?? null,
		publishedYear: year(info.publishedDate),
		language: info.language ?? null,
		pageCount: info.pageCount ?? null,
		// Google serves http by default and the app is https-only.
		coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:") ?? null,
		source: "googlebooks",
	};
}

function year(value: string | undefined): number | null {
	const match = value?.match(/\d{4}/);
	return match ? Number(match[0]) : null;
}

interface OpenLibraryBook {
	title?: string;
	authors?: { name: string }[];
	publishers?: { name: string }[];
	publish_date?: string;
	number_of_pages?: number;
	cover?: { medium?: string };
}

interface OpenLibraryDoc {
	title?: string;
	author_name?: string[];
	first_publish_year?: number;
	cover_i?: number;
}

interface GoogleVolume {
	title?: string;
	subtitle?: string;
	authors?: string[];
	publisher?: string;
	publishedDate?: string;
	language?: string;
	pageCount?: number;
	imageLinks?: { thumbnail?: string };
}
