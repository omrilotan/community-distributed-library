-- Cache of provider responses. This service owns it; nobody else reads it.
CREATE TABLE lookup_cache (
	isbn13     TEXT PRIMARY KEY,
	source     TEXT NOT NULL CHECK (source IN ('openlibrary', 'googlebooks')),
	payload    TEXT NOT NULL, -- normalised MetadataLookup as JSON
	fetched_at INTEGER NOT NULL
);

-- Negative results are cached too, so a missing ISBN is not refetched on every scan.
CREATE TABLE lookup_misses (
	isbn13     TEXT PRIMARY KEY,
	fetched_at INTEGER NOT NULL
);
