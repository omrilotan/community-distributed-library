import { ThingDetails } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { searchKey } from "./normalise.ts";

/** Stored details, read leniently: what no longer fits the schema is left out. */
export function readDetails(stored: string | null): ThingDetails | null {
	if (!stored) return null;
	try {
		const parsed = ThingDetails.safeParse(JSON.parse(stored));
		return parsed.success && Object.keys(parsed.data).length
			? parsed.data
			: null;
	} catch {
		return null;
	}
}

/** What search matches a thing by: its name, and its brand and model. */
export function thingSearchKey(
	name: string,
	details: ThingDetails | null | undefined,
): string {
	return searchKey(
		[name, details?.brand, details?.model].filter(Boolean).join(" "),
	);
}

/** Stored photo addresses, read leniently: anything not a list of strings is none. */
export function readPhotos(stored: string | null | undefined): string[] {
	if (!stored) return [];
	try {
		const parsed: unknown = JSON.parse(stored);
		return Array.isArray(parsed)
			? parsed
					.filter((url): url is string => typeof url === "string")
					.slice(0, 4)
			: [];
	} catch {
		return [];
	}
}

/**
 * A thing's picture is the first of its photos, and also its edition's cover,
 * which listings show. Whoever changes the cover (its owner, a moderator, an
 * assistant), the photos follow, so the owner's next edit, which sends the
 * photos whole, neither drops the new picture nor brings back the old one.
 * Books keep no photos and are left alone.
 */
export function photosFollowCover(
	env: Env,
	editionId: string,
	cover: string | null,
) {
	return env.DB.prepare(
		`UPDATE copies SET photos = CASE
		   WHEN ?2 IS NULL THEN CASE WHEN json_array_length(photos) > 1
		                             THEN json_remove(photos, '$[0]') END
		   WHEN photos IS NULL OR NOT json_valid(photos) THEN json_array(?2)
		   ELSE json_set(photos, '$[0]', ?2) END
		  WHERE edition_id = ?1
		    AND (photos IS NOT NULL OR (SELECT type FROM communities LIMIT 1) = 'things')`,
	).bind(editionId, cover);
}
