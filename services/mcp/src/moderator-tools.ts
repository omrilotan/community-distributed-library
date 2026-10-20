import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Props } from "./env.ts";

type Call = <T>(
	path: string,
	init?: { method?: string; body?: object },
) => Promise<{ status: number; body: T }>;

type Upload = (
	data: string,
	contentType?: string,
) => Promise<{ status: number; body: { coverUrl?: string } }>;

type Result = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

/**
 * What a moderator can do on the website, for their assistant: correct any
 * book and its cover, and keep the tag vocabulary. Registered only for a
 * grant that carries the admin scope, which the consent screen offers to
 * moderators alone, so a member's assistant never sees these tools. Core
 * checks the moderator role on every call regardless.
 */
export function registerModeratorTools(
	server: McpServer,
	props: Props,
	{
		call,
		upload,
		run,
		fail,
		things = false,
	}: {
		call: Call;
		upload: Upload;
		run: <T>(promise: Promise<{ status: number; body: T }>) => Promise<Result>;
		fail: (status: number, body: unknown) => Result;
		/** A library of things: the same tools, described in its words. */
		things?: boolean;
	},
): void {
	if (!props.scopes.includes("admin")) return;
	const say = (books: string, forThings: string) =>
		things ? forThings : books;

	const editWork = (workId: string, body: Record<string, unknown>) =>
		call(`/v1/admin/works/${encodeURIComponent(workId)}`, {
			method: "PATCH",
			body,
		});

	server.registerTool(
		"edit_item",
		{
			description: say(
				"Moderators: correct any book in the catalogue, whoever owns it: its title, its authors, and a note everyone sees (the edition, a series, a translation). Leave out what should not change; send null to clear the note. Find the workId with search_catalogue or get_work.",
				"Moderators: correct any item in the library, whoever owns it: its name and a note everyone sees. Leave out what should not change; send null to clear the note. Find the workId with search_catalogue or get_work.",
			),
			inputSchema: {
				workId: z.string(),
				title: z.string().min(1).max(200).optional(),
				authors: z.array(z.string().min(1).max(100)).max(10).optional(),
				note: z.string().max(500).nullable().optional(),
			},
		},
		({ workId, ...body }) => run(editWork(workId, body)),
	);

	server.registerTool(
		"set_item_cover",
		{
			description: say(
				"Moderators: give any book a cover from an image URL (JPEG, PNG or WebP, up to 2 MB). The library fetches the image and keeps its own copy; the URL is not kept. Works only while the book has one edition.",
				"Moderators: give any item a photo from an image URL (JPEG, PNG or WebP, up to 2 MB). The library fetches the image and keeps its own copy; the URL is not kept.",
			),
			inputSchema: { workId: z.string(), imageUrl: z.string().url() },
		},
		({ workId, imageUrl }) => run(editWork(workId, { coverUrl: imageUrl })),
	);

	server.registerTool(
		"upload_item_cover",
		{
			description: say(
				"Moderators: give any book a cover from image bytes already in hand: base64 (or a data: URL), JPEG/PNG/WebP, up to 2 MB. Use set_item_cover when the image is at a public URL. Works only while the book has one edition.",
				"Moderators: give any item a photo from image bytes already in hand: base64 (or a data: URL), JPEG/PNG/WebP, up to 2 MB. Use set_item_cover when the image is at a public URL.",
			),
			inputSchema: {
				workId: z.string(),
				imageBase64: z.string().min(16),
				contentType: z
					.enum(["image/jpeg", "image/png", "image/webp"])
					.optional(),
			},
		},
		async ({ workId, imageBase64, contentType }) => {
			const stored = await upload(imageBase64, contentType);
			if (stored.status !== 201 || !stored.body.coverUrl)
				return fail(stored.status, stored.body);
			return run(editWork(workId, { coverUrl: stored.body.coverUrl }));
		},
	);

	server.registerTool(
		"remove_item_cover",
		{
			description: say(
				"Moderators: take a wrong cover off a book. It goes back to a plain cover with its title on it until somebody gives it a new one.",
				"Moderators: take a wrong photo off an item. It goes back to a plain tile with its name on it until somebody gives it a new one.",
			),
			inputSchema: { workId: z.string() },
		},
		({ workId }) => run(editWork(workId, { coverUrl: null })),
	);

	// Labels in the languages the library offers; one is enough where it offers
	// one, and core fills the other.
	const labels = z.object({
		en: z.string().min(1).max(40).optional(),
		he: z.string().min(1).max(40).optional(),
	});
	const slug = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "lowercase, a-z0-9-");

	server.registerTool(
		"add_tag",
		{
			description:
				"Moderators: add a tag to the vocabulary without a member suggesting it. `namespace` is an existing group (see list_tags) or a new one, in which case also give namespaceLabels, its name. `value` is the tag's slug within the group. Give labels in the languages the library offers (en, he); one is enough in a library that offers one.",
			inputSchema: {
				namespace: slug,
				namespaceLabels: labels.optional(),
				value: slug,
				labels,
			},
		},
		(body) => run(call("/v1/admin/tags", { method: "POST", body })),
	);

	server.registerTool(
		"edit_tag",
		{
			description: say(
				"Moderators: rename a tag, its slug within its group or its labels. `tag` is the full `namespace:value`. Books that carry it keep it under the new name.",
				"Moderators: rename a category, its slug within its group or its labels. `tag` is the full `namespace:value`. Items that carry it keep it under the new name.",
			),
			inputSchema: {
				tag: z.string(),
				value: slug.optional(),
				labels: labels.optional(),
			},
		},
		({ tag, ...body }) =>
			run(
				call(`/v1/admin/tags/${encodeURIComponent(tag)}`, {
					method: "PATCH",
					body,
				}),
			),
	);

	server.registerTool(
		"remove_tag",
		{
			description: say(
				"Moderators: take a tag out of the vocabulary and off every book that carries it. The built-in tags the library puts on new books cannot be removed. This cannot be undone.",
				"Moderators: take a category out of the vocabulary and off every item that carries it. The built-in categories cannot be removed. This cannot be undone.",
			),
			inputSchema: { tag: z.string() },
		},
		({ tag }) =>
			run(
				call(`/v1/admin/tags/${encodeURIComponent(tag)}`, {
					method: "DELETE",
				}),
			),
	);

	server.registerTool(
		"rename_tag_group",
		{
			description:
				"Moderators: rename a tag group (such as Audience or Genre) in the languages the library offers. Its slug does not change.",
			inputSchema: { namespace: z.string(), labels },
		},
		({ namespace, labels: names }) =>
			run(
				call(`/v1/admin/tag-namespaces/${encodeURIComponent(namespace)}`, {
					method: "PATCH",
					body: { labels: names },
				}),
			),
	);
}
