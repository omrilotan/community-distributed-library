import { core } from "../../../../lib/core.ts";
import { safePath } from "../../../../lib/safe-path.ts";

/** Leave the queue. `back` says where to return to. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const back = safePath(form.get("back"), "/loans");
	const { status } = await core(`/v1/waitlist/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	const location =
		status === 401 ? "/login" : status === 204 ? back : `${back}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
