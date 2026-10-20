import { core } from "../../../../lib/core.ts";
import { safePath } from "../../../../lib/safe-path.ts";

/** A member's suggestion. It goes to the moderators, not to the catalogue. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const namespace = String(form.get("namespace") ?? "").trim();
	const namespaceLabel = String(form.get("namespaceLabel") ?? "").trim();
	const workId = String(form.get("workId") ?? "").trim();
	const back = safePath(form.get("back"), "/");

	const { status } = await core("/v1/tags/proposals", {
		method: "POST",
		body: JSON.stringify({
			...(namespace ? { namespace } : {}),
			...(namespace ? {} : { namespaceLabel }),
			label: String(form.get("label") ?? "").trim(),
			...(workId ? { workId } : {}),
		}),
	});
	const location =
		status === 401
			? "/login"
			: status === 201
				? `${back}?suggested=1`
				: `${back}?error=suggest`;
	return new Response(null, { status: 303, headers: { location } });
}
