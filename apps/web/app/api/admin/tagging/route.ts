import {
	leavesQueue,
	slugify,
	taggingOnly,
	type TaggingOnly,
} from "@cdl/contracts";
import { core } from "../../../../lib/core.ts";

/**
 * Save one book's tags and move on. New values typed into a group become tags
 * first (labelled in both languages with what was typed; the Tags page is
 * where a translation is refined), then the book gets its full set.
 */
export async function POST(request: Request): Promise<Response> {
	const form = await request.formData();
	const workId = String(form.get("workId") ?? "");
	const only = taggingOnly(form.get("only"));
	const at = Math.max(0, Number(form.get("at") ?? 0) || 0);
	const tags = new Set(form.getAll("tags").map(String));

	for (const [key, raw] of form.entries()) {
		if (!key.startsWith("new:")) continue;
		const namespace = key.slice(4);
		const label = String(raw).trim();
		if (!label) continue;
		// A value is latin a-z; a Hebrew label gets a made-up one that stays put.
		const value =
			slugify(label) ||
			`v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
		const made = await core<{ tag?: string; detail?: string }>(
			"/v1/admin/tags",
			{
				method: "POST",
				body: JSON.stringify({
					namespace,
					value,
					labels: { en: label, he: label },
				}),
			},
		);
		if (made.status === 201 && made.body.tag) tags.add(made.body.tag);
		// Already a tag here: use it.
		else if (made.status === 409) tags.add(`${namespace}:${value}`);
		else if (made.status === 401) return redirect("/login");
		else return redirect(back(only, at, "error=1"));
	}

	const saved = await core(`/v1/works/${encodeURIComponent(workId)}/tags`, {
		method: "PUT",
		body: JSON.stringify({ tags: [...tags] }),
	});
	if (saved.status === 401) return redirect("/login");
	if (saved.status !== 204) return redirect(back(only, at, "error=1"));
	// Tagged, the book leaves its queue, so the next one takes its place; in
	// the full list the next one is one further on.
	return redirect(back(only, leavesQueue(only, [...tags]) ? at : at + 1));
}

function back(only: TaggingOnly, at: number, extra?: string): string {
	return `/admin/tagging?only=${encodeURIComponent(only)}&at=${at}${extra ? `&${extra}` : ""}`;
}

function redirect(location: string): Response {
	return new Response(null, { status: 303, headers: { location } });
}
