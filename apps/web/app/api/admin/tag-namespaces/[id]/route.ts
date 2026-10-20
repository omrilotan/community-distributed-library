import { core } from "../../../../../lib/core.ts";
import { formReply } from "../../../../../lib/form-reply.ts";

/** Rename a label group in both languages. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const text = (name: string) => String(form.get(name) ?? "").trim();
	const { status } = await core(
		`/v1/admin/tag-namespaces/${encodeURIComponent(id)}`,
		{
			method: "PATCH",
			body: JSON.stringify({
				// Only the library's languages are on the form; an empty one is left out.
				labels: {
					...(text("labelEn") ? { en: text("labelEn") } : {}),
					...(text("labelHe") ? { he: text("labelHe") } : {}),
				},
			}),
		},
	);
	return formReply(
		request,
		status === 401
			? "/login"
			: status === 204
				? "/admin/tags?saved=1"
				: "/admin/tags?error=1",
		status === 204,
	);
}
