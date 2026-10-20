import { leavesQueue, taggingOnly, type TaggingOnly } from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";

/**
 * Save one of the member's books' tags and move on. A value typed into a
 * group is not a tag yet: it goes to the moderators as a suggestion for this
 * book, and lands on it once they approve. Core checks the book is theirs.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const workId = String(form.get("workId") ?? "");
	const only = taggingOnly(form.get("only"));
	const at = Math.max(0, Number(form.get("at") ?? 0) || 0);
	const tags = [...new Set(form.getAll("tags").map(String))];

	let suggested = false;
	for (const [key, raw] of form.entries()) {
		if (!key.startsWith("new:")) continue;
		const label = String(raw).trim();
		if (!label) continue;
		const proposed = await core("/v1/tags/proposals", {
			method: "POST",
			body: JSON.stringify({ namespace: key.slice(4), label, workId }),
		});
		if (proposed.status === 401) return redirect("/login");
		if (proposed.status >= 300) return redirect(back(only, at, "error=1"));
		suggested = true;
	}

	const saved = await core(`/v1/works/${encodeURIComponent(workId)}/tags`, {
		method: "PUT",
		body: JSON.stringify({ tags }),
	});
	if (saved.status === 401) return redirect("/login");
	if (saved.status !== 204) return redirect(back(only, at, "error=1"));
	// Tagged, the book leaves its queue and the next takes its place.
	return redirect(
		back(
			only,
			leavesQueue(only, tags) ? at : at + 1,
			suggested ? "suggested=1" : undefined,
		),
	);
}

function back(only: TaggingOnly, at: number, extra?: string): string {
	return `/shelf/tagging?only=${encodeURIComponent(only)}&at=${at}${extra ? `&${extra}` : ""}`;
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
