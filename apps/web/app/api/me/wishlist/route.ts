import { core } from "../../../../lib/core.ts";
import { formReply } from "../../../../lib/form-reply.ts";

/** Keep a book to read later, or let it go: `wished` is "1" or "0". */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const workId = String(form.get("workId") ?? "");
	const wished = form.get("wished") === "1";
	const { status } = await core(
		`/v1/me/wishlist/${encodeURIComponent(workId)}`,
		{
			method: wished ? "PUT" : "DELETE",
		},
	);
	if (status === 401) return formReply(request, "/login", false);
	return formReply(
		request,
		`/works/${encodeURIComponent(workId)}${status === 204 ? "" : "?error=1"}`,
		status === 204,
	);
}
