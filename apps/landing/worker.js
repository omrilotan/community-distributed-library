/**
 * The site is static files, served without this. It runs only for the three
 * pages and for /video/* (run_worker_first in wrangler.jsonc).
 *
 * A page is HTML, or its Markdown twin (build.mjs) for an agent that asks
 * for text/markdown in Accept. The answer varies by Accept either way.
 *
 * A video: the asset server answers a Range request with the whole file, and
 * Safari will not play a video it cannot ask for in parts. So the file comes
 * from the assets whole, and the part asked for goes back as 206.
 */
const TWINS = {
	"/": "/index.md",
	"/assistants": "/assistants.md",
	"/open-a-library": "/open-a-library.md",
};

export default {
	async fetch(request, env) {
		const twin = TWINS[new URL(request.url).pathname];
		if (twin) return page(request, env, twin);

		const headers = new Headers(request.headers);
		const range = headers.get("Range");
		headers.delete("Range");
		const whole = await env.ASSETS.fetch(
			new Request(request.url, { method: "GET", headers }),
		);
		if (!whole.ok) return whole;

		const out = new Headers(whole.headers);
		out.set("Accept-Ranges", "bytes");
		const body = await whole.arrayBuffer();
		const size = body.byteLength;
		const part = range ? bytes(range, size) : undefined;
		const head = request.method === "HEAD";

		if (part === null) {
			out.set("Content-Range", `bytes */${size}`);
			out.delete("Content-Length");
			return new Response(null, { status: 416, headers: out });
		}
		if (!part) {
			return new Response(head ? null : body, { status: 200, headers: out });
		}
		const [start, end] = part;
		out.set("Content-Range", `bytes ${start}-${end}/${size}`);
		out.set("Content-Length", String(end - start + 1));
		return new Response(head ? null : body.slice(start, end + 1), {
			status: 206,
			headers: out,
		});
	},
};

/**
 * One byte range, as [first, last], or null when it cannot be served.
 * Anything this does not understand (several ranges, another unit) is
 * answered with the whole file, as HTTP allows.
 */
function bytes(header, size) {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (!match[1] && !match[2])) return undefined;
	if (!match[1]) {
		const suffix = Number(match[2]);
		if (!suffix) return null;
		return [Math.max(0, size - suffix), size - 1];
	}
	const start = Number(match[1]);
	const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
	if (start >= size || end < start) return null;
	return [start, end];
}

/** A page as HTML, or as Markdown when the Accept header prefers it. */
async function page(request, env, twin) {
	const markdown = prefersMarkdown(request.headers.get("Accept") ?? "");
	const asset = await env.ASSETS.fetch(
		markdown
			? new Request(new URL(twin, request.url), {
					method: request.method,
					headers: request.headers,
				})
			: request,
	);
	const response = new Response(asset.body, asset);
	response.headers.append("Vary", "Accept");
	if (!asset.ok) return response;
	if (markdown) {
		response.headers.set("Content-Type", "text/markdown; charset=utf-8");
	} else {
		response.headers.append(
			"Link",
			`<${twin}>; rel="alternate"; type="text/markdown"`,
		);
	}
	return response;
}

/**
 * Whether Accept names text/markdown, and likes it at least as much as HTML.
 * A browser never names it, so it always gets HTML; an agent that asks for
 * Markdown first, or only, gets Markdown.
 */
function prefersMarkdown(accept) {
	let markdown = 0;
	let html = 0;
	let rank = -1;
	for (const part of accept.split(",")) {
		const [type, ...params] = part.trim().toLowerCase().split(";");
		const q = params
			.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1])
			.find(Boolean);
		const weight = q === undefined ? 1 : Number(q);
		if (type === "text/markdown") markdown = weight;
		// The most specific of text/html, text/* and */* is what HTML is worth.
		const specific = ["*/*", "text/*", "text/html"].indexOf(type);
		if (specific > rank) {
			rank = specific;
			html = weight;
		}
	}
	return markdown > 0 && markdown >= html;
}
