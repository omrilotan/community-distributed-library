import { cache } from "react";
import type { Vocabulary } from "@cdl/contracts";
import { core } from "./core.ts";

const EMPTY: Vocabulary = { namespaces: [], tags: [] };

/**
 * The tag vocabulary for the signed-in member, or nothing if the call fails.
 * Once per request, however many parts of a page want it.
 */
export const vocabulary = cache(async (): Promise<Vocabulary> => {
	const { status, body } = await core<Vocabulary>("/v1/tags");
	return status === 200 ? body : EMPTY;
});
