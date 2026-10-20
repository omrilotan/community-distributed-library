import type { CoverUploadResponse } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";
import { uploadPhotos } from "../../../../lib/photos.ts";

/** Save edits. A new cover goes through /v1/covers first, like a new listing. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const back = `/shelf/${encodeURIComponent(id)}`;
	const form = await request.formData();

	let coverUrl: string | undefined;
	const cover = form.get("cover");
	if (cover instanceof File && cover.size > 0) {
		const upload = new FormData();
		upload.set("file", cover, cover.name);
		const stored = await core<CoverUploadResponse>("/v1/covers", {
			method: "POST",
			body: upload,
		});
		if (stored.status !== 201) return redirect(`${back}?error=cover`);
		coverUrl = stored.body.coverUrl;
	}

	const title = String(form.get("title") ?? "").trim();
	const authors = String(form.get("authors") ?? "")
		.split(",")
		.map((author) => author.trim())
		.filter(Boolean);
	const loanDaysRaw = String(form.get("loanDays") ?? "").trim();
	// A thing's owner names it, counts it and describes it.
	const thing = form.get("kind") === "thing";
	const details = Object.fromEntries(
		["brand", "model", "included", "needs", "care", "link"]
			.map((key) => [key, String(form.get(key) ?? "").trim()])
			.filter(([, value]) => value),
	);
	const quantity = Number(form.get("quantity") ?? "");
	// A thing's photos, in the order the owner set: a kept one by its
	// address (only if still ticked), a new one by its place among the files.
	const added = thing ? await uploadPhotos(form.getAll("photos"), 4) : [];
	if (!added) return redirect(`${back}?error=cover`);
	const kept = form.getAll("keep").map(String);
	const order = String(form.get("order") ?? "")
		.split(" ")
		.filter(Boolean);
	const photos = thing
		? (order.length
				? order.flatMap((entry) => {
						if (entry.startsWith("kept:")) {
							const url = entry.slice(5);
							return kept.includes(url) ? [url] : [];
						}
						const photo = added[Number(entry.slice(4))];
						return entry.startsWith("new:") && photo ? [photo] : [];
					})
				: [...kept, ...added]
			).slice(0, 4)
		: [];

	const { status } = await core(`/v1/copies/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify({
			condition: String(form.get("condition") ?? "good"),
			...(form.has("lending") ? { lending: String(form.get("lending")) } : {}),
			relayAllowed: form.get("relayAllowed") === "on",
			loanDays: loanDaysRaw ? Number(loanDaysRaw) : null,
			note: String(form.get("note") ?? "").trim() || null,
			...(coverUrl ? { coverUrl } : {}),
			...(title ? { title } : {}),
			...(authors.length ? { authors } : {}),
			...(thing
				? {
						details: Object.keys(details).length ? details : null,
						photos,
						// Absent while the item is out: the field is disabled.
						...(quantity >= 1 ? { quantity } : {}),
						// A set is never passed straight on.
						...(quantity > 1 ? { relayAllowed: false } : {}),
					}
				: {}),
		}),
	});

	if (status === 401) return redirect("/login");
	if (status === 204) {
		// Tags belong to the book; the form carries them alongside the copy.
		const workId = String(form.get("workId") ?? "");
		if (workId) {
			await core(`/v1/works/${encodeURIComponent(workId)}/tags`, {
				method: "PUT",
				body: JSON.stringify({ tags: form.getAll("tags").map(String) }),
			});
		}
		return redirect(`${back}?saved=1`);
	}
	if (status === 409)
		return redirect(
			`${back}?error=${title || authors.length ? "shared" : "locked"}`,
		);
	return redirect(`${back}?error=1`);
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
