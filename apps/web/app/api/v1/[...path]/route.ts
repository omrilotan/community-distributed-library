import { CLIENT_IP_HEADER, coreRaw } from "../../../../lib/core.ts";

/**
 * The public REST API. Requests pass straight to core with the caller's own
 * `Authorization: Bearer` header — never the browser session cookie, so a page
 * on another origin cannot ride a signed-in visitor.
 */
async function proxy(
	request: Request,
	context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
	const { path } = await context.params;
	const incoming = new URL(request.url);
	const target = `/v1/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
	const headers = new Headers();
	for (const name of [
		"authorization",
		"content-type",
		"accept",
		"accept-language",
	]) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const ip = request.headers.get("cf-connecting-ip");
	if (ip) headers.set(CLIENT_IP_HEADER, ip);
	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	const response = await coreRaw(target, {
		method: request.method,
		headers,
		...(hasBody ? { body: await request.arrayBuffer() } : {}),
	});
	// Strip hop-by-hop noise; keep the content type, cache hints, and when a
	// refused client may try again.
	const out = new Headers();
	for (const name of [
		"content-type",
		"cache-control",
		"etag",
		"location",
		"retry-after",
	]) {
		const value = response.headers.get(name);
		if (value) out.set(name, value);
	}
	return new Response(response.body, { status: response.status, headers: out });
}

export {
	proxy as GET,
	proxy as POST,
	proxy as PUT,
	proxy as PATCH,
	proxy as DELETE,
};
