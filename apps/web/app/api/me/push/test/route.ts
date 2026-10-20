import { core } from "../../../../../lib/core.ts";

/** Ask core to push a test to this browser's subscription. */
export async function POST(request: Request): Promise<Response> {
	const { status, body } = await core<{ sent: number; known: boolean }>(
		"/v1/me/push/test",
		{ method: "POST", body: await request.text() },
	);
	return Response.json(body ?? {}, { status });
}
