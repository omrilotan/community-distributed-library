/**
 * The site is static files, served without this. It runs only for /video/*
 * (run_worker_first in wrangler.jsonc): the asset server answers a Range
 * request with the whole file, and Safari will not play a video it cannot
 * ask for in parts. So the file comes from the assets whole, and the part
 * asked for goes back as 206.
 */
export default {
	async fetch(request, env) {
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
