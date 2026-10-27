/**
 * Every tool is one of three kinds. The kind is how an assistant decides to
 * ask the member before calling it: over MCP it becomes the tool's
 * annotations, on the library's pages WebMCP's.
 *
 * - read: looks, changes nothing.
 * - own: changes the member's own things (their shelf, their queue).
 * - others: reaches another member, or what everyone sees.
 */
export type Kind = "read" | "own" | "others";

export const KINDS: Record<string, { kind: Kind; destructive?: boolean }> = {
	my_profile: { kind: "read" },
	search_catalogue: { kind: "read" },
	browse_shelves: { kind: "read" },
	list_tags: { kind: "read" },
	my_tag_proposals: { kind: "read" },
	my_invites: { kind: "read" },
	get_work: { kind: "read" },
	lookup_isbn: { kind: "read" },
	list_my_shelf: { kind: "read" },
	list_my_loans: { kind: "read" },
	my_waitlist: { kind: "read" },
	get_loan_messages: { kind: "read" },

	set_lend_limit: { kind: "own" },
	add_copy: { kind: "own" },
	set_cover: { kind: "own" },
	upload_cover: { kind: "own" },
	update_copy: { kind: "own", destructive: true },
	join_waitlist: { kind: "own" },
	leave_waitlist: { kind: "own", destructive: true },

	// Tags and a book's details are shared by every copy of it.
	set_item_tags: { kind: "others", destructive: true },
	propose_tag: { kind: "others" },
	invite_neighbour: { kind: "others" },
	request_loan: { kind: "others" },
	respond_to_request: { kind: "others", destructive: true },
	cancel_loan: { kind: "others", destructive: true },
	extend_loan: { kind: "others" },
	report_problem: { kind: "others" },
	nudge: { kind: "others" },
	post_loan_message: { kind: "others" },

	// Moderators' tools: they change what the whole library sees.
	edit_item: { kind: "others", destructive: true },
	set_item_cover: { kind: "others", destructive: true },
	upload_item_cover: { kind: "others", destructive: true },
	remove_item_cover: { kind: "others", destructive: true },
	add_tag: { kind: "others" },
	edit_tag: { kind: "others", destructive: true },
	remove_tag: { kind: "others", destructive: true },
	rename_tag_group: { kind: "others", destructive: true },
};

const CONFIRM =
	"Changes something: say what you will do and get the member's yes first.";
const REACHES =
	"Reaches another member or everyone: say exactly what will be sent or changed and get the member's yes first.";

/** A tool's kind, and the warning its description ends with, if any. */
export function kindOf(name: string): {
	kind: Kind;
	destructive: boolean;
	note: string | null;
} {
	const entry = KINDS[name];
	// A new tool has to be classified before it can be offered.
	if (!entry) throw new Error(`Tool "${name}" has no safety kind`);
	const { kind, destructive = false } = entry;
	return {
		kind,
		destructive,
		note: kind === "read" ? null : kind === "own" ? CONFIRM : REACHES,
	};
}
