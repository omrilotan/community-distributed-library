import { z } from "zod";
import { Id, Locale, Timestamp } from "./primitives.ts";

/**
 * The vocabulary is curated but not fixed: it lives in the database, and
 * members suggest additions that a moderator approves (decisions 0023, 0025).
 * Curation is what keeps a bilingual community from ending up with "children"
 * and "ילדים" as two unrelated tags.
 */

/** `namespace:value`, both lowercase slugs. The shape is fixed; the set is not. */
export const SLUG = /^[a-z][a-z0-9-]{0,29}:[a-z0-9][a-z0-9-]{0,39}$/;
export const Tag = z.string().regex(SLUG, "expected namespace:value");
export const Slug = z
	.string()
	.regex(/^[a-z][a-z0-9-]{0,39}$/, "lowercase, a-z0-9-");
/** A tag group's name: no longer than the group part of a tag can be. */
export const Namespace = z
	.string()
	.regex(/^[a-z][a-z0-9-]{0,29}$/, "lowercase, a-z0-9-, up to 30");

export const TagLabels = z.object({
	en: z.string().trim().min(1).max(40),
	he: z.string().trim().min(1).max(40),
});

/**
 * Labels as a moderator writes them: in the languages their library offers,
 * at least one. A library in one language has no use for the other, so the
 * missing one takes the given one's words; the vocabulary always holds both.
 */
export const TagLabelsInput = z
	.object({
		en: z.string().trim().min(1).max(40).optional(),
		he: z.string().trim().min(1).max(40).optional(),
	})
	.refine((labels) => Boolean(labels.en ?? labels.he), {
		message: "a label in at least one language",
	})
	.transform((labels) => ({
		en: (labels.en ?? labels.he)!,
		he: (labels.he ?? labels.en)!,
	}));

export const TagNamespace = z.object({
	id: Slug,
	labels: TagLabels,
	builtin: z.boolean(),
});

export const TagDefinition = z.object({
	slug: Tag,
	namespace: Slug,
	value: Slug,
	labels: TagLabels,
	builtin: z.boolean(),
	/** Works carrying it in this community. */
	works: z.number().int().nonnegative().default(0),
});

/** Everything the chips, pickers and filters need in one call. */
export const Vocabulary = z.object({
	namespaces: z.array(TagNamespace),
	tags: z.array(TagDefinition),
});

/**
 * Filter semantics: OR inside a namespace, AND across them. Ticking Fiction
 * and Poetry means either; adding Hebrew narrows both. `any` and `all` force
 * one rule over the whole set, for callers that want it.
 */
export const TagMatch = z.enum(["facets", "any", "all"]);

export const SetWorkTags = z.object({ tags: z.array(Tag).max(50) });

/** Kept for the storefront's chip counts. */
export const TagCount = z.object({
	tag: Tag,
	works: z.number().int().nonnegative(),
});

/**
 * A suggestion. Either a value inside a namespace that exists, or a whole new
 * label — a member types what they mean in their own language and a moderator
 * turns it into a slug and both labels.
 */
export const ProposeTag = z
	.object({
		/** An existing namespace id, or omitted when proposing a new label. */
		namespace: Namespace.optional(),
		/** The new label's name, in the member's words, when there is no namespace. */
		namespaceLabel: z.string().trim().min(1).max(40).optional(),
		/** The value, in the member's words. */
		label: z.string().trim().min(1).max(40),
		/** Apply it to this book once approved. */
		workId: Id.optional(),
	})
	.refine((value) => Boolean(value.namespace ?? value.namespaceLabel), {
		message: "choose a label or name a new one",
	});

export const TagProposal = z.object({
	id: Id,
	status: z.enum(["pending", "approved", "declined"]),
	namespace: Slug.nullable(),
	namespaceLabel: z.string().nullable(),
	label: z.string(),
	locale: Locale,
	note: z.string().nullable(),
	tag: Tag.nullable(),
	proposedBy: z.object({ id: Id, displayName: z.string() }),
	work: z.object({ id: Id, title: z.string() }).nullable(),
	createdAt: Timestamp,
	decidedAt: Timestamp.nullable(),
});

/**
 * Approving is an edit, not a rubber stamp: the moderator settles the slug and
 * both labels. Hebrew is not transliterated (decision 0010), so a suggestion
 * written in Hebrew needs its `value` typed by hand.
 */
export const ApproveTag = z.object({
	namespace: Namespace.optional(),
	namespaceLabels: TagLabelsInput.optional(),
	value: Slug,
	labels: TagLabelsInput,
});

/** A moderator adding a tag without anybody having suggested it. */
export const CreateTag = z.object({
	namespace: Namespace,
	/** Only when the namespace is new: its name in the library's languages. */
	namespaceLabels: TagLabelsInput.optional(),
	value: Slug,
	labels: TagLabelsInput,
});

/**
 * Which books a tagging queue walks: those with no tag but their language,
 * every one, or those with nothing yet in one group ("missing:audience").
 */
export const TaggingOnly = z
	.string()
	.regex(/^(untagged|all|missing:[a-z][a-z0-9-]{0,29})$/);
export type TaggingOnly = z.infer<typeof TaggingOnly>;

/** A queue from a link or a form: anything unknown is the untagged queue. */
export function taggingOnly(raw: unknown): TaggingOnly {
	const parsed = TaggingOnly.safeParse(raw);
	return parsed.success ? parsed.data : "untagged";
}

/** The group a "missing:" queue walks, if it is one. */
export function missingGroup(only: TaggingOnly): string | null {
	return only.startsWith("missing:") ? only.slice("missing:".length) : null;
}

/**
 * Whether a book saved with these tags leaves the queue, so the next book
 * takes its place rather than sitting one further on.
 */
export function leavesQueue(only: TaggingOnly, tags: string[]): boolean {
	const group = missingGroup(only);
	if (group) return tags.some((tag) => tag.startsWith(`${group}:`));
	if (only === "untagged")
		return tags.some((tag) => !tag.startsWith("language:"));
	return false;
}

/** One book in the moderators' tagging queue, and where it sits in it. */
export const TaggingStep = z.object({
	/** How many books the queue holds, and this one's place in it (0-based). */
	total: z.number().int().nonnegative(),
	at: z.number().int().nonnegative(),
	work: z
		.object({
			id: z.string(),
			title: z.string(),
			authors: z.array(z.string()),
			coverUrl: z.string().nullable(),
			tags: z.array(z.string()),
		})
		.nullable(),
});

/** Renaming a label group — the "Audience" above a row of chips. */
export const EditNamespace = z.object({ labels: TagLabelsInput });

export const DeclineTag = z.object({
	note: z.string().trim().max(200).optional(),
});

export function namespaceOf(tag: string): string {
	return tag.split(":")[0] ?? "";
}

/** `?tags=genre:fiction,language:he` — malformed slugs are dropped, not an error. */
/** More than any page asks for; past it, the query would outgrow SQLite. */
export const MAX_FILTER_TAGS = 20;

export function parseTags(value: string | undefined | null): string[] {
	if (!value) return [];
	return [
		...new Set(
			value
				.split(",")
				.map((part) => part.trim())
				.filter((part) => SLUG.test(part)),
		),
	].slice(0, MAX_FILTER_TAGS);
}

export function groupTags(tags: string[]): Map<string, string[]> {
	const grouped = new Map<string, string[]>();
	for (const tag of tags) {
		const namespace = namespaceOf(tag);
		grouped.set(namespace, [...(grouped.get(namespace) ?? []), tag]);
	}
	return grouped;
}

/** A slug from a label, when the label is already Latin. Hebrew returns "". */
export function slugify(label: string): string {
	return label
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
}

export type Tag = z.infer<typeof Tag>;
export type TaggingStep = z.infer<typeof TaggingStep>;
export type TagLabels = z.infer<typeof TagLabels>;
export type TagNamespace = z.infer<typeof TagNamespace>;
export type TagDefinition = z.infer<typeof TagDefinition>;
export type Vocabulary = z.infer<typeof Vocabulary>;
export type TagMatch = z.infer<typeof TagMatch>;
export type SetWorkTags = z.input<typeof SetWorkTags>;
export type TagCount = z.infer<typeof TagCount>;
export type ProposeTag = z.input<typeof ProposeTag>;
export type TagProposal = z.infer<typeof TagProposal>;
export type ApproveTag = z.input<typeof ApproveTag>;
export type DeclineTag = z.input<typeof DeclineTag>;
export type CreateTag = z.input<typeof CreateTag>;
export type EditNamespace = z.input<typeof EditNamespace>;
