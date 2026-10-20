import { core } from "../../../../../lib/core.ts";
import { safePath } from "../../../../../lib/safe-path.ts";

/** Fold this book into another. `into` is the record that survives. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const into = String(form.get("into") ?? "");
	const back = safePath(form.get("back"), "/");
	const { status } = await core(`/v1/works/${encodeURIComponent(id)}/merge`, {
		method: "POST",
		body: JSON.stringify({ into }),
	});
	const location =
		status === 401
			? "/login"
			: status === 200
				? `${back}${back.includes("?") ? "&" : "?"}merged=1`
				: `${back}${back.includes("?") ? "&" : "?"}error=merge`;
	return new Response(null, { status: 303, headers: { location } });
}
