import { core } from "../../../../lib/core.ts";
import { formReply } from "../../../../lib/form-reply.ts";

/** Mark a book read, or not: `read` is "1" or "0". Back to the book. */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const workId = String(form.get("workId") ?? "");
	const read = form.get("read") === "1";
	const { status } = await core(`/v1/me/read/${encodeURIComponent(workId)}`, {
		method: read ? "PUT" : "DELETE",
	});
	if (status === 401) return formReply(request, "/login", false);
	return formReply(
		request,
		`/works/${encodeURIComponent(workId)}${status === 204 ? "" : "?error=1"}`,
		status === 204,
	);
}
