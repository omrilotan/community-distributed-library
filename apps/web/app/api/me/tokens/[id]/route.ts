import { core } from "../../../../../lib/core.ts";

/** Disconnect an app: revokes its token in core. */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const { status } = await core(`/v1/me/tokens/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/settings?revoked=1"
				: "/settings?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
