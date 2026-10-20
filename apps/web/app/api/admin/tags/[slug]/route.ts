import { core } from "../../../../../lib/core.ts";
import { formReply } from "../../../../../lib/form-reply.ts";

/** Rename a tag (its slug and both labels), or take it out altogether. */
export async function POST(
	request: Request,
	context: { params: Promise<{ slug: string }> },
): Promise<Response> {
	const { slug } = await context.params;
	const form = await request.formData();
	const text = (name: string) => String(form.get(name) ?? "").trim();
	const at = `/v1/admin/tags/${encodeURIComponent(decodeURIComponent(slug))}`;

	if (text("action") === "remove") {
		const { status } = await core(at, { method: "DELETE" });
		return formReply(
			request,
			status === 401
				? "/login"
				: status === 204
					? "/admin/tags?removed=1"
					: "/admin/tags?error=1",
			status === 204,
		);
	}

	const { status, body } = await core<{ tag: string }>(at, {
		method: "PATCH",
		body: JSON.stringify({
			value: text("value"),
			// Only the library's languages are on the form; an empty one is left out.
			labels: {
				...(text("labelEn") ? { en: text("labelEn") } : {}),
				...(text("labelHe") ? { he: text("labelHe") } : {}),
			},
		}),
	});
	return formReply(
		request,
		status === 401
			? "/login"
			: status === 200
				? `/admin/tags?saved=${encodeURIComponent(body.tag)}`
				: "/admin/tags?error=1",
		status === 200,
	);
}
