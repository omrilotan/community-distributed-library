import { describe, expect, it, vi } from "vitest";
import { sendPush } from "./push.ts";

const encoder = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");

const unb64url = (value: string) => {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

/** A browser's half of a subscription: an ECDH keypair and an auth secret. */
async function subscriber() {
	const keys = (await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	)) as CryptoKeyPair;
	const publicKey = new Uint8Array(
		(await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer,
	);
	const auth = crypto.getRandomValues(new Uint8Array(16));
	return {
		private: keys.privateKey,
		subscription: {
			endpoint: "https://push.example/send/abc",
			p256dh: b64url(publicKey),
			auth: b64url(auth),
		},
		publicKey,
		auth,
	};
}

async function vapid() {
	const keys = (await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	)) as CryptoKeyPair;
	const raw = new Uint8Array(
		(await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer,
	);
	const jwk = (await crypto.subtle.exportKey(
		"jwk",
		keys.privateKey,
	)) as JsonWebKey;
	return {
		verify: keys.publicKey,
		config: {
			publicKey: b64url(raw),
			privateJwk: {
				kty: "EC",
				crv: "P-256",
				d: jwk.d,
				x: jwk.x,
				y: jwk.y,
			} as JsonWebKey,
			subject: "mailto:library@example.com",
		},
	};
}

async function hkdf(
	salt: Uint8Array,
	ikm: Uint8Array,
	info: Uint8Array,
	length: number,
) {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
		"deriveBits",
	]);
	return new Uint8Array(
		await crypto.subtle.deriveBits(
			{ name: "HKDF", hash: "SHA-256", salt, info },
			key,
			length * 8,
		),
	);
}

/** What a push service's client does with the body, so we know it is right. */
async function decrypt(
	body: Uint8Array,
	recipientPrivate: CryptoKey,
	recipientPublic: Uint8Array,
	auth: Uint8Array,
) {
	const salt = body.slice(0, 16);
	const keyLength = body[20]!;
	const serverPublic = body.slice(21, 21 + keyLength);
	const ciphertext = body.slice(21 + keyLength);

	const shared = new Uint8Array(
		await crypto.subtle.deriveBits(
			{
				name: "ECDH",
				public: await crypto.subtle.importKey(
					"raw",
					serverPublic,
					{ name: "ECDH", namedCurve: "P-256" },
					false,
					[],
				),
			} as unknown as SubtleCryptoDeriveKeyAlgorithm,
			recipientPrivate,
			256,
		),
	);
	const ikm = await hkdf(
		auth,
		shared,
		new Uint8Array([
			...encoder.encode("WebPush: info\0"),
			...recipientPublic,
			...serverPublic,
		]),
		32,
	);
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
		["decrypt"],
	);
	const plaintext = new Uint8Array(
		await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: nonce },
			key,
			ciphertext,
		),
	);
	// The trailing byte is the record delimiter.
	return new TextDecoder().decode(plaintext.slice(0, -1));
}

describe("web push", () => {
	it("sends a payload the recipient can decrypt, and nobody else", async () => {
		const to = await subscriber();
		const keys = await vapid();
		const sent = vi.fn(async () => new Response(null, { status: 201 }));
		vi.stubGlobal("fetch", sent);

		const notification = {
			title: "Sam asked for Oz",
			body: "Tap to answer",
			url: "/loans",
		};
		const response = await sendPush(to.subscription, notification, keys.config);
		expect(response.status).toBe(201);

		const [url, init] = sent.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(to.subscription.endpoint);
		const headers = init.headers as Record<string, string>;
		expect(headers["Content-Encoding"]).toBe("aes128gcm");
		expect(headers.TTL).toBeTruthy();

		const body = new Uint8Array(init.body as ArrayBuffer);
		const plaintext = await decrypt(body, to.private, to.publicKey, to.auth);
		expect(JSON.parse(plaintext)).toEqual(notification);

		// A different subscriber's key must not open it.
		const other = await subscriber();
		await expect(
			decrypt(body, other.private, other.publicKey, other.auth),
		).rejects.toThrow();
		vi.unstubAllGlobals();
	});

	it("signs the request for the push service that will receive it", async () => {
		const to = await subscriber();
		const keys = await vapid();
		const sent = vi.fn(async () => new Response(null, { status: 201 }));
		vi.stubGlobal("fetch", sent);
		await sendPush(to.subscription, { title: "x" }, keys.config);

		const [, init] = sent.mock.calls[0] as unknown as [string, RequestInit];
		const header = (init.headers as Record<string, string>).Authorization!;
		const [, token] = /vapid t=([^,]+), k=(.+)/.exec(header)!;
		const [header64, claims64, signature64] = token!.split(".");

		const claims = JSON.parse(new TextDecoder().decode(unb64url(claims64!)));
		// The audience is the push service's origin, not the endpoint path.
		expect(claims.aud).toBe("https://push.example");
		expect(claims.sub).toBe("mailto:library@example.com");
		expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

		const valid = await crypto.subtle.verify(
			{ name: "ECDSA", hash: "SHA-256" },
			keys.verify,
			unb64url(signature64!),
			encoder.encode(`${header64}.${claims64}`),
		);
		expect(valid).toBe(true);
		vi.unstubAllGlobals();
	});
});
