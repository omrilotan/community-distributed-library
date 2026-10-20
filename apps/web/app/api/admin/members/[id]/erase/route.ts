import { core } from "../../../../../../lib/core.ts";

/** Forget a member, on the admin's typed confirmation. Core checks it all. */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const { status } = await core(
		`/v1/admin/members/${encodeURIComponent(id)}/erase`,
		{
			method: "POST",
			body: JSON.stringify({ confirm: String(form.get("confirm") ?? "") }),
		},
	);
	const location =
		status === 401
			? "/login"
			: status === 200
				? "/admin/members?erased=1"
				: `/admin/members/${encodeURIComponent(id)}?error=${status === 409 ? "erase-blocked" : "1"}`;
	return new Response(null, { status: 303, headers: { location } });
}
