/**
 * Web push, by hand: RFC 8291 for the payload and RFC 8292 for the signature.
 * A library would be one more thing to keep current for about a hundred lines
 * of Web Crypto that the platform already provides.
 */

export interface Subscription {
	endpoint: string;
	p256dh: string;
	auth: string;
}

export interface Vapid {
	/** The public key, base64url, as handed to the browser at subscribe time. */
	publicKey: string;
	/** JWK of the matching private key. */
	privateJwk: JsonWebKey;
	/** Who to complain to; part of the signed claim. */
	subject: string;
}

const encoder = new TextEncoder();

export async function sendPush(
	subscription: Subscription,
	payload: unknown,
	vapid: Vapid,
	ttlSeconds = 12 * 60 * 60,
): Promise<Response> {
	const body = await encrypt(
		encoder.encode(JSON.stringify(payload)),
		decode(subscription.p256dh),
		decode(subscription.auth),
	);
	const endpoint = new URL(subscription.endpoint);
	const token = await vapidToken(endpoint.origin, vapid);

	return fetch(subscription.endpoint, {
		method: "POST",
		headers: {
			TTL: String(ttlSeconds),
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
		},
		body,
	});
}

/** ES256 over the usual three claims; good for twelve hours. */
async function vapidToken(audience: string, vapid: Vapid): Promise<string> {
	const header = b64url(
		encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })),
	);
	const claims = b64url(
		encoder.encode(
			JSON.stringify({
				aud: audience,
				exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
				sub: vapid.subject,
			}),
		),
	);
	const key = await crypto.subtle.importKey(
		"jwk",
		{ ...vapid.privateJwk, key_ops: ["sign"], ext: true } as JsonWebKey,
		{ name: "ECDSA", namedCurve: "P-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		{ name: "ECDSA", hash: "SHA-256" },
		key,
		encoder.encode(`${header}.${claims}`),
	);
	return `${header}.${claims}.${b64url(new Uint8Array(signature))}`;
}

/** aes128gcm, one record: salt | rs | keyid length | server key | ciphertext. */
async function encrypt(
	plaintext: Uint8Array,
	clientPublic: Uint8Array,
	authSecret: Uint8Array,
): Promise<Uint8Array> {
	const server = (await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	)) as CryptoKeyPair;
	const serverPublic = new Uint8Array(
		(await crypto.subtle.exportKey("raw", server.publicKey)) as ArrayBuffer,
	);
	const shared = new Uint8Array(
		await crypto.subtle.deriveBits(
			{
				name: "ECDH",
				// workerd's types call this $public; the runtime reads `public`.
				public: await crypto.subtle.importKey(
					"raw",
					clientPublic,
					{ name: "ECDH", namedCurve: "P-256" },
					false,
					[],
				),
			} as unknown as SubtleCryptoDeriveKeyAlgorithm,
			server.privateKey,
			256,
		),
	);

	// The browser's auth secret salts the shared secret, then the record salt
	// derives the content key and nonce (RFC 8291 §3.3).
	const ikm = await hkdf(
		authSecret,
		shared,
		concat(encoder.encode("WebPush: info\0"), clientPublic, serverPublic),
		32,
	);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(
		salt,
		ikm,
		encoder.encode("Content-Encoding: aes128gcm\0"),
		16,
	);
	const nonce = await hkdf(
		salt,
		ikm,
		encoder.encode("Content-Encoding: nonce\0"),
		12,
	);

	const key = await crypto.subtle.importKey(
		"raw",
		cek,
		{ name: "AES-GCM" },
		false,
		["encrypt"],
	);
	// 0x02 marks the last record; there is only ever one here.
	const padded = concat(plaintext, new Uint8Array([2]));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, padded),
	);

	const recordSize = new Uint8Array(4);
	new DataView(recordSize.buffer).setUint32(0, 4096);
	return concat(
		salt,
		recordSize,
		new Uint8Array([serverPublic.length]),
		serverPublic,
		ciphertext,
	);
}

async function hkdf(
	salt: Uint8Array,
	ikm: Uint8Array,
	info: Uint8Array,
	length: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "HKDF", hash: "SHA-256", salt, info },
		key,
		length * 8,
	);
	return new Uint8Array(bits);
}

function concat(...parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const part of parts) {
		out.set(part, at);
		at += part.length;
	}
	return out;
}

export function decode(value: string): Uint8Array {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function b64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
