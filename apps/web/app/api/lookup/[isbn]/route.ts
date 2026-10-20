import type { MetadataLookup } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";

/** Preview for the add form. Same endpoint any client would call. */
export async function GET(
	_request: Request,
	context: { params: Promise<{ isbn: string }> },
): Promise<Response> {
	const { isbn } = await context.params;
	const { status, body } = await core<MetadataLookup>(
		`/v1/lookup/${encodeURIComponent(isbn)}`,
	);
	return Response.json(status === 200 ? body : null, {
		status: status === 200 ? 200 : 404,
	});
}
