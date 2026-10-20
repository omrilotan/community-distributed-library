import { core } from "../../../lib/core.ts";

/** Place and postcode suggestions as a member types their neighbourhood. */
export async function GET(request: Request): Promise<Response> {
	const q = new URL(request.url).searchParams.get("q") ?? "";
	const { status, body } = await core(`/v1/places?q=${encodeURIComponent(q)}`);
	return Response.json(body ?? { places: [] }, { status });
}
