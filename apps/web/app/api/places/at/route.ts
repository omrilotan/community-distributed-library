import { core } from "../../../../lib/core.ts";

/** The name of the area around a point, for "Use my location". */
export async function GET(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const lat = url.searchParams.get("lat") ?? "";
	const lng = url.searchParams.get("lng") ?? "";
	const { status, body } = await core(
		`/v1/places/at?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
	);
	return Response.json(body ?? { name: null }, { status });
}
