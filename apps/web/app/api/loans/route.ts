import { core } from "../../../lib/core.ts";

/** Why core said no, by its problem's title, as the book page words it. */
const REFUSED: Record<string, string> = {
	"Already requested": "taken",
	Away: "away",
	"Lending as many as they can": "limit",
	"On hold": "hold",
	"Not that many free": "count",
	"Already asked": "asked",
};

export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const workId = String(form.get("workId") ?? "");
	const message = String(form.get("message") ?? "").trim();
	const quantity = Number(form.get("quantity") ?? 1) || 1;
	const { status, body } = await core<{ title?: string }>("/v1/loans", {
		method: "POST",
		body: JSON.stringify({
			copyId: String(form.get("copyId") ?? ""),
			...(message ? { message } : {}),
			...(quantity > 1 ? { quantity } : {}),
		}),
	});
	const back = `/works/${encodeURIComponent(workId)}`;
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?requested=1`
				: status === 409
					? `${back}?error=${REFUSED[body?.title ?? ""] ?? "unavailable"}`
					: `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
