import { coreRaw } from "./core.ts";

/**
 * The server's push key, handed to a signed-in page so the browser need not
 * ask for it on every view (renewIfStale in lib/push-key.ts). Asked of core
 * and kept for a minute, as library() is: it changes only when the library
 * moves to a new key pair, and a browser whose subscription disagrees with
 * this copy still asks for the key itself.
 */
// In development every request asks again, as library() does.
const TTL_MS = process.env.NODE_ENV === "production" ? 60_000 : 0;
let known: { value: string; until: number } | null = null;

/** Null when core has no key or does not answer; the browser then asks. */
export async function pushPublicKey(): Promise<string | null> {
	if (known && known.until > Date.now()) return known.value;
	try {
		const response = await coreRaw("/v1/push/key", {
			headers: { accept: "application/json" },
		});
		if (!response.ok) return null;
		const { publicKey } = (await response.json()) as {
			publicKey?: string | null;
		};
		// No key yet is not kept: the first view after one is set sees it.
		if (!publicKey) return null;
		known = { value: publicKey, until: Date.now() + TTL_MS };
		return publicKey;
	} catch {
		return null;
	}
}
