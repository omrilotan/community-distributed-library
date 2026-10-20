import app from "vinext/server/fetch-handler";
import { withEdgeCache } from "./lib/edge-cache.ts";

export * from "vinext/server/fetch-handler";

/** vinext's own Worker, with the edge's copy of public pages in front of it. */
export default withEdgeCache(app);
