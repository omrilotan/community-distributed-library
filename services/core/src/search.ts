import type { ListingSort, Tag, TagMatch } from "@cdl/contracts";
import type { Env } from "./env.ts";
import type { Viewer } from "./auth.ts";
import { listWorks } from "./listings.ts";

/**
 * The pilot's search lives here rather than in its own Worker. The contract is
 * this one function, so extracting `services/search` later is a move, not a
 * rewrite (decision 0013).
 */
export function searchCopies(
	env: Env,
	viewer: Viewer,
	params: {
		q: string;
		within?: number | undefined;
		limit: number;
		offset?: number;
		tags?: Tag[];
		match?: TagMatch;
		sort?: ListingSort;
		availableOnly?: boolean;
		includeOwn?: boolean;
		includeRead?: boolean;
		wished?: boolean;
	},
) {
	return listWorks(env, viewer, {
		text: params.q,
		within: params.within,
		limit: params.limit,
		offset: params.offset ?? 0,
		tags: params.tags,
		match: params.match,
		sort: params.sort,
		availableOnly: params.availableOnly,
		includeOwn: params.includeOwn ?? false,
		includeRead: params.includeRead ?? false,
		wished: params.wished ?? false,
	});
}
