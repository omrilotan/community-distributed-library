import { core } from "../../../../../lib/core.ts";

/** Withdraw an invite that has not been used. */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const { status } = await core(
		`/v1/me/invites/${encodeURIComponent(id)}/revoke`,
		{ method: "POST" },
	);
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/settings?withdrawn=1"
				: "/settings?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
