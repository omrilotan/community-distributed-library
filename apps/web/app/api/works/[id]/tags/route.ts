import { core } from "../../../../../lib/core.ts";
import { safePath } from "../../../../../lib/safe-path.ts";

/** The tag picker posts the whole set; core replaces what the book had. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const { status } = await core(`/v1/works/${encodeURIComponent(id)}/tags`, {
		method: "PUT",
		body: JSON.stringify({ tags: form.getAll("tags").map(String) }),
	});
	const back = safePath(form.get("back"), `/works/${id}`);
	const location =
		status === 401
			? "/login"
			: status === 204
				? `${back}?tagged=1`
				: `${back}?error=tags`;
	return new Response(null, { status: 303, headers: { location } });
}
