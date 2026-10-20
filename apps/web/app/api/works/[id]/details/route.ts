import type { CoverUploadResponse } from "@cdl/contracts";
import { core } from "../../../../../lib/core.ts";
import { safePath } from "../../../../../lib/safe-path.ts";

/** A moderator correcting a book: its title, its authors, or its edition. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const back = safePath(form.get("back"), "/");
	const authors = String(form.get("authors") ?? "")
		.split(",")
		.map((author) => author.trim())
		.filter(Boolean);

	// A new cover goes through the same public endpoint any client would use.
	const file = form.get("cover");
	let coverUrl: string | undefined;
	if (file instanceof File && file.size > 0) {
		const upload = new FormData();
		upload.set("file", file, file.name);
		const stored = await core<CoverUploadResponse>("/v1/covers", {
			method: "POST",
			body: upload,
		});
		if (stored.status !== 201) {
			return new Response(null, {
				status: 303,
				headers: { location: `${back}?error=cover` },
			});
		}
		coverUrl = stored.body.coverUrl;
	}

	const text = (name: string) => String(form.get(name) ?? "").trim();
	// A note left empty clears what was there; the form always sends it.
	const { status } = await core(`/v1/admin/works/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify({
			title: text("title"),
			...(authors.length ? { authors } : {}),
			note: text("note") || null,
			...(coverUrl ? { coverUrl } : {}),
		}),
	});
	const location =
		status === 401
			? "/login"
			: `${back}?${status === 200 ? "edited=1" : "error=edit"}`;
	return new Response(null, { status: 303, headers: { location } });
}
