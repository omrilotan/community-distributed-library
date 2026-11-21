import { core } from "../../../../../lib/core.ts";

/** The asker has it, or no longer needs it. */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const { status } = await core(`/v1/asks/${encodeURIComponent(id)}/close`, {
		method: "POST",
		body: "{}",
	});
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/loans?closed=1"
				: "/loans?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
