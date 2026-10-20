import { core } from "../../../../lib/core.ts";

/** Register this browser for notifications. */
export async function POST(request: Request): Promise<Response> {
	const { status } = await core("/v1/me/push", {
		method: "PUT",
		body: await request.text(),
	});
	return new Response(null, { status });
}

export async function DELETE(request: Request): Promise<Response> {
	const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
	const { status } = await core(
		`/v1/me/push?endpoint=${encodeURIComponent(endpoint)}`,
		{ method: "DELETE" },
	);
	return new Response(null, { status });
}
