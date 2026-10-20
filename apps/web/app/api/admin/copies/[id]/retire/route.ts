import { core } from "../../../../../../lib/core.ts";

export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const { status } = await core(
		`/v1/admin/copies/${encodeURIComponent(id)}/retire`,
		{
			method: "POST",
		},
	);
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/admin/assets?retired=1"
				: "/admin/assets?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
