import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker from "./worker.js";

const VIDEO = "https://example.test/video/clip.mp4";
const BYTES = new Uint8Array(100).map((_, index) => index);

/** Assets that serve BYTES whole, as the asset server does for a video. */
function assets() {
	return {
		fetch: async () =>
			new Response(BYTES, {
				headers: { "Content-Type": "video/mp4", "Content-Length": "100" },
			}),
	};
}

/**
 * Assets whose body breaks after the first chunk, as it does when the
 * visitor hangs up while the file is still coming.
 */
function hungUp() {
	return {
		fetch: async () =>
			new Response(
				new ReadableStream({
					pull(controller) {
						if (!this.sent) {
							this.sent = true;
							controller.enqueue(BYTES.slice(0, 10));
						} else {
							controller.error(new Error("Network connection lost."));
						}
					},
				}),
				{ headers: { "Content-Type": "video/mp4" } },
			),
	};
}

describe("a video", () => {
	it("is passed through whole, without being read, when no range is asked for", async () => {
		const response = await worker.fetch(new Request(VIDEO), {
			ASSETS: hungUp(),
		});
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("Accept-Ranges"), "bytes");
	});

	it("is answered whole when no range is asked for", async () => {
		const response = await worker.fetch(new Request(VIDEO), {
			ASSETS: assets(),
		});
		assert.equal(response.status, 200);
		assert.deepEqual(new Uint8Array(await response.arrayBuffer()), BYTES);
	});

	it("is answered in part when a range is asked for", async () => {
		const response = await worker.fetch(
			new Request(VIDEO, { headers: { Range: "bytes=10-19" } }),
			{ ASSETS: assets() },
		);
		assert.equal(response.status, 206);
		assert.equal(response.headers.get("Content-Range"), "bytes 10-19/100");
		assert.deepEqual(
			new Uint8Array(await response.arrayBuffer()),
			BYTES.slice(10, 20),
		);
	});

	it("is refused when the range is past its end", async () => {
		const response = await worker.fetch(
			new Request(VIDEO, { headers: { Range: "bytes=200-" } }),
			{ ASSETS: assets() },
		);
		assert.equal(response.status, 416);
		assert.equal(response.headers.get("Content-Range"), "bytes */100");
	});
});
