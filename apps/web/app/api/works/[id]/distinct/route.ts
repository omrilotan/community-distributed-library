import { core } from "../../../../../lib/core.ts";
import { safePath } from "../../../../../lib/safe-path.ts";

/** "They are different books." Remembered, so nobody is asked again. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const { status } = await core(
		`/v1/works/${encodeURIComponent(id)}/distinct`,
		{
			method: "POST",
			body: JSON.stringify({ from: String(form.get("from") ?? "") }),
		},
	);
	const back = safePath(form.get("back"), "/");
	const location =
		status === 401
			? "/login"
			: `${back}${back.includes("?") ? "&" : "?"}${status === 204 ? "kept=1" : "error=merge"}`;
	return new Response(null, { status: 303, headers: { location } });
}
