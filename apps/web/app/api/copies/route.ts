import type { CopyDetail, CoverUploadResponse } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { uploadPhotos } from "../../../lib/photos.ts";

/**
 * Translates the HTML form into the same `POST /v1/copies` call any other
 * client makes, then returns to the add page ready for the next book: listing
 * a shelf is many saves in a row.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const isbn13 = String(form.get("isbn13") ?? "").replace(/\D/g, "");
	const title = String(form.get("title") ?? "").trim();
	const authors = String(form.get("authors") ?? "")
		.split(",")
		.map((author) => author.trim())
		.filter(Boolean);
	// The cover goes through the same public endpoint any client would use.
	const cover = form.get("cover");
	let coverUrl: string | undefined;
	if (cover instanceof File && cover.size > 0) {
		const upload = new FormData();
		upload.set("file", cover, cover.name);
		const stored = await core<CoverUploadResponse>("/v1/covers", {
			method: "POST",
			body: upload,
		});
		if (stored.status !== 201) {
			return new Response(null, {
				status: 303,
				headers: { location: "/shelf/add?error=cover" },
			});
		}
		coverUrl = stored.body.coverUrl;
	}

	// A library of things sends a thing: its name, how many, the owner's details.
	const text = (name: string) => String(form.get(name) ?? "").trim();
	const details = Object.fromEntries(
		["brand", "model", "included", "needs", "care", "link"]
			.map((key) => [key, text(key)])
			.filter(([, value]) => value),
	);
	// A thing's photos: up to four squares, in the order the member put them.
	const photoUrls =
		form.get("kind") === "thing"
			? await uploadPhotos(form.getAll("photos"), 4)
			: [];
	if (!photoUrls)
		return new Response(null, {
			status: 303,
			headers: { location: "/shelf/add?error=cover" },
		});
	const thing =
		form.get("kind") === "thing"
			? {
					thing: {
						name: text("name"),
						quantity: Math.max(1, Number(form.get("quantity") ?? 1) || 1),
						...(Object.keys(details).length ? { details } : {}),
						...(photoUrls.length ? { photoUrls } : {}),
					},
				}
			: null;

	const payload = {
		...thing,
		...(thing ? {} : isbn13.length === 13 ? { isbn13 } : {}),
		...(!thing && title && authors.length > 0
			? { manual: { title, authors, ...(coverUrl ? { coverUrl } : {}) } }
			: {}),
		condition: String(form.get("condition") ?? "good"),
		relayAllowed: form.get("relayAllowed") === "on",
		...(form.get("note") ? { note: String(form.get("note")) } : {}),
	};

	const { status, body } = await core<{ id: string; workId: string }>(
		"/v1/copies",
		{
			method: "POST",
			body: JSON.stringify(payload),
		},
	);

	if (status === 401)
		return new Response(null, { status: 303, headers: { location: "/login" } });
	if (status !== 201)
		return new Response(null, {
			status: 303,
			headers: { location: "/shelf/add?error=1" },
		});
	// Tags live on the book, so they are set after the copy resolves its work.
	const tags = form.getAll("tags").map(String);
	if (tags.length) {
		await core(`/v1/works/${encodeURIComponent(body.workId)}/tags`, {
			method: "PUT",
			body: JSON.stringify({ tags }),
		});
	}
	const saved = await core<CopyDetail>(`/v1/copies/${body.id}`);
	const count = (Number(form.get("n") ?? 0) || 0) + 1;
	const added =
		saved.status === 200 ? saved.body.edition.title : title || text("name");

	// Somebody may already have listed this book under a different title. The
	// save is not held up for it; the next screen asks.
	// Two neighbours' drills are two drills: only books are asked.
	const similar = thing
		? null
		: await core<{ candidates: { id: string }[] }>(
				`/v1/works/${encodeURIComponent(body.workId)}/duplicates`,
			);
	const candidate =
		similar?.status === 200 ? similar.body.candidates[0]?.id : undefined;
	// A thing goes straight to My things, where it now is. A book goes back to
	// the form: listing a shelf of books is many saves in a row.
	if (thing)
		return new Response(null, {
			status: 303,
			headers: { location: `/shelf?added=${encodeURIComponent(added)}` },
		});
	const location = `/shelf/add?added=${encodeURIComponent(added)}&n=${count}${
		candidate ? `&mine=${body.workId}&dupe=${candidate}` : ""
	}`;
	return new Response(null, { status: 303, headers: { location } });
}
