import app from "vinext/server/fetch-handler";
import { withEdgeCache } from "./lib/edge-cache.ts";
import { withNotFoundPage } from "./lib/not-found-page.ts";

export * from "vinext/server/fetch-handler";

/** Stamped at build time (vite.config.ts): the directories under app/. */
declare const __APP_ROUTES__: string[];

/**
 * vinext's own Worker, with the edge's copy of public pages in front of it,
 * and an address with no route answered from memory before either.
 */
export default withNotFoundPage(withEdgeCache(app), __APP_ROUTES__);
