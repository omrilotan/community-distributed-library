import { SELF } from "cloudflare:test";
import { COVER_MAX_BYTES } from "@cdl/contracts";
import { describe, expect, it } from "vitest";
import { SAM } from "../test/api.ts";

/** A 1×1 PNG: the smallest thing that is what it says it is. */
const PIXEL_PNG = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
	),
	(char) => char.charCodeAt(0),
);

/** Upload as a member would, or as nobody. */
async function upload(file: Blob | string | null, who: string | null = SAM) {
	const form = new FormData();
	if (typeof file === "string") form.set("file", file);
	else if (file) form.set("file", file, "cover");
	const response = await SELF.fetch("http://core.test/v1/covers", {
		method: "POST",
		headers: who ? { "X-Member-Id": who } : {},
		body: form,
	});
	return {
		status: response.status,
		body: (await response.json()) as { coverUrl?: string; detail?: string },
	};
}

describe("a cover upload", () => {
	it("keeps a real image, and serves it back as it came", async () => {
		const sent = await upload(new Blob([PIXEL_PNG], { type: "image/png" }));
		expect(sent.status).toBe(201);
		const key = sent.body.coverUrl!.split("/").pop()!;
		expect(key).toMatch(/^[0-9A-Z]{26}\.png$/);
		const served = await SELF.fetch(`http://core.test/v1/covers/${key}`);
		expect(served.status).toBe(200);
		expect(served.headers.get("content-type")).toBe("image/png");
		expect(new Uint8Array(await served.arrayBuffer())).toEqual(PIXEL_PNG);
	});

	it("refuses bytes that are not the image they claim to be", async () => {
		const svg = new TextEncoder().encode(
			'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
		);
		const disguised = await upload(new Blob([svg], { type: "image/png" }));
		expect(disguised.status).toBe(422);
		expect(disguised.body.detail).toMatch(/not the image type/);
		// A JPEG's name on a PNG's bytes is a lie too.
		const misnamed = await upload(
			new Blob([PIXEL_PNG], { type: "image/jpeg" }),
		);
		expect(misnamed.status).toBe(422);
	});

	it("refuses a kind of image it does not keep", async () => {
		for (const [type, bytes] of [
			["image/svg+xml", new TextEncoder().encode("<svg/>")],
			["image/gif", new TextEncoder().encode("GIF89a")],
		] as const) {
			const answer = await upload(new Blob([bytes], { type }));
			expect(answer.status, type).toBe(422);
		}
	});

	it("refuses one over 2 MB, however it starts", async () => {
		const big = new Uint8Array(COVER_MAX_BYTES + 1);
		big.set(PIXEL_PNG);
		const answer = await upload(new Blob([big], { type: "image/png" }));
		expect(answer.status).toBe(422);
		expect(answer.body.detail).toMatch(/2 MB/);
	});

	it("needs a file, and somebody who may list books", async () => {
		expect((await upload(null)).status).toBe(422);
		expect((await upload("not a file")).status).toBe(422);
		expect(
			(await upload(new Blob([PIXEL_PNG], { type: "image/png" }), null)).status,
		).toBe(401);
	});
});

describe("a stored cover", () => {
	it("is only ever one of the library's own names", async () => {
		for (const key of [
			"..%2Fsecrets.png",
			"01J0NOTACOVER.png",
			"01J0ABCDEFGHJKMNPQRSTVWXYZ.svg",
			// The right shape, but nothing by that name.
			"01J0ABCDEFGHJKMNPQRSTVWXYZ.png",
		])
			expect(
				(await SELF.fetch(`http://core.test/v1/covers/${key}`)).status,
				key,
			).toBe(404);
	});
});
