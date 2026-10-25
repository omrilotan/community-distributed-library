import type { Env } from "./env.ts";

/**
 * Small pieces of read-mostly data, cached one by one rather than by response:
 * a page is assembled from a viewer's own listing and from facts the whole
 * community shares, and only the second kind can be reused. Each fragment is
 * stored under its own key, so one changing does not cost the others.
 *
 * The store is the Workers cache, which lives in the colo that filled it. A
 * purge reaches that colo alone, so every fragment also carries a short life:
 * the purge is what makes a change appear at once where it was made, and the
 * expiry is what bounds how long anywhere else can disagree.
 */
const ORIGIN = "https://fragments.cdl";

/** Development and tests read through, so a write is visible in the next read. */
function enabled(env: Env): boolean {
	return env.DEV_AUTH !== "true";
}

function request(key: string): Request {
	return new Request(`${ORIGIN}/${encodeURIComponent(key)}`);
}

/**
 * The cached value for `key`, or what `build` returns — stored for `ttl`
 * seconds. A failure to cache is not a failure to answer.
 */
export async function fragment<T>(
	env: Env,
	ctx: { waitUntil(promise: Promise<unknown>): void } | undefined,
	key: string,
	ttl: number,
	build: () => Promise<T>,
): Promise<T> {
	if (!enabled(env)) return build();

	const cache = caches.default;
	const hit = await cache.match(request(key)).catch(() => undefined);
	if (hit) {
		// A stored null is an answer too (a postcode nobody has); only an
		// entry that cannot be read is built again.
		try {
			return (await hit.json()) as T;
		} catch {
			// damaged entry: rebuilt below
		}
	}

	const value = await build();
	const store = cache.put(
		request(key),
		new Response(JSON.stringify(value), {
			headers: {
				"content-type": "application/json",
				"cache-control": `max-age=${ttl}`,
			},
		}),
	);
	if (ctx) ctx.waitUntil(store.catch(() => undefined));
	else await store.catch(() => undefined);
	return value;
}

/** Forget these fragments here, so the colo that changed something sees it. */
export async function forget(env: Env, ...keys: string[]): Promise<void> {
	if (!enabled(env)) return;
	await Promise.all(
		keys.map((key) => caches.default.delete(request(key)).catch(() => false)),
	);
}

/** The curated tags and their counts, which every listing page asks for. */
export const vocabularyKey = (communityId: string) =>
	`vocabulary:${communityId}`;
