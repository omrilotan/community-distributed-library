import { z } from "zod";
import {
	pageTools,
	sessionCall,
	sessionUpload,
} from "../../../../lib/page-tools.ts";

/**
 * One tool, called by an agent in the browser through the page (WebMCP), run
 * as the signed-in member. Only the page itself may ask: the session cookie
 * rides along, so another site's page must not (middleware refuses a
 * cross-origin POST; a browser that says where a request came from is held
 * to its own origin here too).
 *
 * The answer is core's: its status and its body, as the MCP server passes
 * them on.
 */
export async function POST(
	request: Request,
	context: { params: Promise<{ name: string }> },
): Promise<Response> {
	const site = request.headers.get("sec-fetch-site");
	if (site && site !== "same-origin")
		return new Response("Cross-origin request refused", { status: 403 });
	const { name } = await context.params;
	const tools = await pageTools();
	if (!tools) return Response.json({ title: "Signed out" }, { status: 401 });
	const tool = tools.find((one) => one.name === name);
	if (!tool) return Response.json({ title: "No such tool" }, { status: 404 });
	const parsed = z
		.object(tool.input)
		.safeParse(await request.json().catch(() => undefined));
	if (!parsed.success)
		return Response.json(
			{ title: "Invalid input", issues: z.treeifyError(parsed.error) },
			{ status: 400 },
		);
	const reply = await tool.run(parsed.data, {
		call: sessionCall,
		upload: sessionUpload,
	});
	// A failed step core did not fail by its status is a failure all the
	// same; a 204 carries no body, so the tool's "done" goes as a 200.
	const status =
		reply.failed && reply.status < 400
			? 502
			: reply.status === 204
				? 200
				: reply.status;
	return Response.json(reply.body ?? { ok: true }, {
		status,
		headers: { "cache-control": "no-store" },
	});
}
