import { COVER_MAX_BYTES, CoverContentType } from "@cdl/contracts";
import type { Env } from "./env.ts";
import { ulid, now } from "./ids.ts";

const EXTENSION: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export type StoreResult =
	{ ok: true; coverUrl: string } | { ok: false; reason: string };

/**
 * Covers live in R2, keyed by a fresh ULID so nothing about the member or the
 * book leaks through the URL. The object is immutable once written.
 */
export async function storeCover(env: Env, file: File): Promise<StoreResult> {
	const type = CoverContentType.safeParse(file.type);
	if (!type.success)
		return { ok: false, reason: "cover must be JPEG, PNG, or WebP" };
	if (file.size > COVER_MAX_BYTES)
		return { ok: false, reason: "cover larger than 2 MB" };
	// The declared type is a claim; the first bytes are the fact.
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	if (sniff(head) !== type.data) {
		return { ok: false, reason: "file is not the image type it claims" };
	}

	const key = `${ulid()}.${EXTENSION[type.data]}`;
	await env.COVERS.put(key, file.stream(), {
		httpMetadata: {
			contentType: type.data,
			cacheControl: "public, max-age=31536000, immutable",
		},
	});

	return {
		ok: true,
		coverUrl: `${env.COVERS_PUBLIC_URL.replace(/\/$/, "")}/${key}`,
	};
}

/** Streams a stored cover. Used locally and as a fallback when no public bucket domain exists. */
export async function readCover(env: Env, key: string): Promise<Response> {
	if (!/^[0-9A-HJKMNP-TV-Z]{26}\.(jpg|png|webp)$/.test(key)) {
		return new Response("not found", { status: 404 });
	}
	const object = await env.COVERS.get(key);
	if (!object) return new Response("not found", { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	return new Response(object.body, { headers });
}

/**
 * Fetch an image by URL and store it as a cover. For clients that cannot
 * upload a file (MCP). Same limits as an upload; the source URL is not kept.
 */
export async function storeCoverFromUrl(
	env: Env,
	url: string,
): Promise<StoreResult> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: "image/jpeg,image/png,image/webp" },
			signal: AbortSignal.timeout(10_000),
			redirect: "follow",
		});
	} catch {
		return { ok: false, reason: "could not fetch the image" };
	}
	if (!response.ok)
		return { ok: false, reason: `image URL answered ${response.status}` };

	const contentType = (response.headers.get("content-type") ?? "")
		.split(";")[0]!
		.trim();
	const type = CoverContentType.safeParse(contentType);
	if (!type.success)
		return { ok: false, reason: "cover must be JPEG, PNG, or WebP" };

	const declared = Number(response.headers.get("content-length") ?? 0);
	if (declared > COVER_MAX_BYTES)
		return { ok: false, reason: "cover larger than 2 MB" };
	const bytes = await readCapped(response, COVER_MAX_BYTES);
	if (!bytes) return { ok: false, reason: "cover larger than 2 MB" };
	if (bytes.byteLength === 0) return { ok: false, reason: "empty image" };

	return storeCover(env, new File([bytes], "cover", { type: type.data }));
}

/** The body, or null as soon as it passes the cap: never all of a huge one. */
async function readCapped(
	response: Response,
	cap: number,
): Promise<Uint8Array | null> {
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > cap) {
			await reader.cancel().catch(() => undefined);
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.byteLength;
	}
	return bytes;
}

/**
 * A cover we serve is a cover we hold. Providers and clients hand us URLs on
 * their own servers; we take one copy and keep it, so no page here points at
 * somebody else's host and no cover disappears when they move it. Returns null
 * when the image cannot be taken, which leaves the book without one.
 */
export async function ownCover(
	env: Env,
	url: string | null | undefined,
): Promise<string | null> {
	if (!url) return null;
	if (ours(env, url)) return url;

	// The same provider address arrives for every member who lists the book.
	const seen = await env.DB.prepare(
		"SELECT cover_url FROM cover_cache WHERE source_url = ?",
	)
		.bind(url)
		.first<{ cover_url: string }>();
	if (seen) return seen.cover_url;

	const stored = await storeCoverFromUrl(env, url);
	if (!stored.ok) return null;
	await env.DB.prepare(
		`INSERT INTO cover_cache (source_url, cover_url, created_at)
		 VALUES (?, ?, ?) ON CONFLICT (source_url) DO NOTHING`,
	)
		.bind(url, stored.coverUrl, now())
		.run();
	return stored.coverUrl;
}

/**
 * Anything still pointing somewhere else — listed before covers were taken in,
 * or written while the fetch was failing — is brought in by the nightly pass.
 */
export async function rehostCovers(
	env: Env,
	limit = 25,
): Promise<{ taken: number; failed: number }> {
	const bucket = env.COVERS_PUBLIC_URL.replace(/\/$/, "");
	const { results } = await env.DB.prepare(
		`SELECT id, cover_url FROM editions
		  WHERE cover_url IS NOT NULL
		    AND cover_url NOT LIKE ?
		  ORDER BY coalesce(cover_tried_at, 0), id
		  LIMIT ?`,
	)
		.bind(`${bucket}/%`, limit)
		.all<{ id: string; cover_url: string }>();

	let taken = 0;
	let failed = 0;
	for (const row of results) {
		const mine = await ownCover(env, row.cover_url);
		if (!mine) {
			// Tried tonight: the others go first tomorrow.
			await env.DB.prepare(
				"UPDATE editions SET cover_tried_at = ? WHERE id = ?",
			)
				.bind(now(), row.id)
				.run();
			failed += 1;
			continue;
		}
		await env.DB.prepare("UPDATE editions SET cover_url = ? WHERE id = ?")
			.bind(mine, row.id)
			.run();
		taken += 1;
	}
	return { taken, failed };
}

/**
 * Remove images of ours that nothing shows any more, given by their public
 * addresses: one image can be every edition's cover of a book whose provider
 * gave them all the same picture, so an edition's cover or a copy's photo
 * still naming it keeps it. Anything not ours is left alone. The cover cache
 * forgets a removed image, so a later listing fetches it afresh.
 */
export async function deleteUnusedImages(
	env: Env,
	urls: (string | null)[],
): Promise<string[]> {
	const removed: string[] = [];
	for (const url of new Set(urls)) {
		if (!url || !ours(env, url)) continue;
		const key = new URL(url).pathname.split("/").at(-1) ?? "";
		if (!/^[0-9A-HJKMNP-TV-Z]{26}\.(jpg|png|webp)$/.test(key)) continue;
		const used = await env.DB.prepare(
			`SELECT 1 FROM editions WHERE cover_url = ?1
			  UNION ALL
			 SELECT 1 FROM copies c, json_each(c.photos) p
			  WHERE json_valid(c.photos) AND p.value = ?1
			  LIMIT 1`,
		)
			.bind(url)
			.first();
		if (used) continue;
		await env.COVERS.delete(key);
		await env.DB.prepare("DELETE FROM cover_cache WHERE cover_url = ?")
			.bind(url)
			.run();
		removed.push(url);
	}
	return removed;
}

/**
 * Already in our bucket: the same origin as the bucket's public address and
 * under its path. Matching on a path fragment alone let any host that put
 * "/v1/covers/" in a URL pass for ours.
 */
function ours(env: Env, url: string): boolean {
	try {
		const bucket = new URL(env.COVERS_PUBLIC_URL.replace(/\/?$/, "/"));
		const candidate = new URL(url);
		return (
			candidate.origin === bucket.origin &&
			candidate.pathname.startsWith(bucket.pathname)
		);
	} catch {
		return false;
	}
}

/** Magic bytes for the three accepted formats; anything else is null. */
function sniff(
	head: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
	if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
		return "image/jpeg";
	if (
		head[0] === 0x89 &&
		head[1] === 0x50 &&
		head[2] === 0x4e &&
		head[3] === 0x47
	)
		return "image/png";
	const ascii = String.fromCharCode(...head.slice(0, 12));
	if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")
		return "image/webp";
	return null;
}
