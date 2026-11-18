import type { Env } from "./env.ts";

/**
 * A sealed copy of a secret that has to be shown again: an invite's link, to
 * whoever made it. AES-GCM under a key that lives only in the Worker's
 * secrets (INVITE_KEY), so the database, its backups and a copy pulled to a
 * laptop hold nothing that opens a door. Tied to its row: a sealed value
 * moved to another row does not open.
 *
 * Without the key nothing is sealed, and the secret is shown once as before.
 */
async function keyOf(env: Env): Promise<CryptoKey | null> {
	if (!env.INVITE_KEY) return null;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(env.INVITE_KEY),
	);
	return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) =>
	Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** Whether this library keeps links to show again. */
export const seals = (env: Env) => Boolean(env.INVITE_KEY);

/** The sealed secret, or null where the library has no key. */
export async function seal(
	env: Env,
	secret: string,
	rowId: string,
): Promise<string | null> {
	const key = await keyOf(env);
	if (!key) return null;
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(rowId) },
		key,
		new TextEncoder().encode(secret),
	);
	return `${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** The secret again, or null: no key, another key, another row, or damage. */
export async function unseal(
	env: Env,
	sealed: string | null,
	rowId: string,
): Promise<string | null> {
	const key = await keyOf(env);
	const [iv, body] = (sealed ?? "").split(".");
	if (!key || !iv || !body) return null;
	try {
		const opened = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: fromBase64(iv),
				additionalData: new TextEncoder().encode(rowId),
			},
			key,
			fromBase64(body),
		);
		return new TextDecoder().decode(opened);
	} catch {
		return null;
	}
}
