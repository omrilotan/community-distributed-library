import { core } from "../../../../../lib/core.ts";

export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const { status } = await core(`/v1/copies/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/shelf?removed=1"
				: status === 409
					? `/shelf/${encodeURIComponent(id)}?error=locked`
					: `/shelf/${encodeURIComponent(id)}?error=1`;
	return new Response(null, { status: 303, headers: { location } });
}
