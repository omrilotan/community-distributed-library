import { core } from "../../../../../lib/core.ts";

/** Take an offer back while nobody has taken it. */
export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await params;
	const { status } = await core(
		`/v1/ask-offers/${encodeURIComponent(id)}/withdraw`,
		{ method: "POST", body: "{}" },
	);
	const location =
		status === 401
			? "/login"
			: status === 204
				? "/loans?withdrawn=1"
				: "/loans?error=1";
	return new Response(null, { status: 303, headers: { location } });
}
