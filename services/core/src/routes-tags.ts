import { Hono } from "hono";
import {
	ApproveTag,
	CreateTag,
	DeclineTag,
	EditNamespace,
	ProposeTag,
	SetWorkTags,
	missingGroup,
	problem,
	taggingOnly,
	type TaggingStep,
	type TagProposal,
} from "@cdl/contracts";
import type { Env } from "./env.ts";
import { forget, vocabularyKey } from "./cache.ts";
import { moderator, viewer, viewerWith } from "./auth.ts";
import { ulid, now } from "./ids.ts";
import { denied, json } from "./problem.ts";
import {
	cachedVocabulary,
	knownTags,
	setWorkTags,
	tagsForWork,
} from "./tags.ts";
import { TAG_IN_COMMUNITY, tagSharedWith } from "./community-catalogue.ts";
import { record } from "./audit.ts";

export const tags = new Hono<{ Bindings: Env }>();
/** The whole vocabulary, plus how many works carry each tag here. */
tags.get("/v1/tags", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	const { namespaces, tags: all } = await cachedVocabulary(
		c.env,
		c.executionCtx,
		member.communityId,
	);
	return c.json({
		namespaces,
		tags: all,
		// The storefront's chip counts, kept for callers that only want those.
		counts: all
			.filter((tag) => tag.works > 0)
			.map((tag) => ({ tag: tag.slug, works: tag.works })),
	});
});

tags.get("/v1/works/:id/tags", async (c) => {
	const { member, forbidden } = await viewerWith(c, "catalogue:read");
	if (!member) return denied(c, forbidden);
	return c.json({ tags: await tagsForWork(c.env, c.req.param("id")) });
});

/**
 * Tags belong to the book, so anyone holding a copy of it may set them, and
 * moderators may set any. Mis-tagging is a conversation, not a permission model.
 */
tags.put("/v1/works/:id/tags", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const workId = c.req.param("id");
	const parsed = SetWorkTags.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid tags"));

	const [{ owns, moderates }, known] = await Promise.all([
		mayTag(
			c.env,
			workId,
			member.id,
			member.communityId,
			// A moderator's token without the admin scope acts as a member.
			member.scopes.includes("admin"),
		),
		// Slugs outside the vocabulary are dropped: the way in is a proposal.
		knownTags(c.env, parsed.data.tags, member.communityId),
	]);
	if (!owns && !moderates) {
		return json(
			c,
			problem(403, "Not your book", "Tags are set by members who own a copy"),
		);
	}
	// Tagging a book one does not hold is a moderator's power: logged.
	if (!owns)
		await record(c.env, {
			communityId: member.communityId,
			actorId: member.id,
			via: member.client,
			action: "PUT /v1/works/:id/tags",
			target: workId,
			details: JSON.stringify({ tags: known }),
		});
	await setWorkTags(c.env, workId, known, member.id);
	return c.body(null, 204);
});

/** Suggest a value, or a whole new label. It reaches nobody until approved. */
tags.post("/v1/tags/proposals", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:write");
	if (!member) return denied(c, forbidden);
	const parsed = ProposeTag.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid suggestion"));
	const { namespace, namespaceLabel, label, workId } = parsed.data;

	if (namespace) {
		const exists = await c.env.DB.prepare(
			"SELECT 1 FROM tag_namespaces WHERE id = ?",
		)
			.bind(namespace)
			.first();
		if (!exists) return json(c, problem(404, "No such label"));
	}
	const open = await c.env.DB.prepare(
		`SELECT count(*) AS n FROM tag_proposals
		  WHERE proposed_by = ? AND status = 'pending'`,
	)
		.bind(member.id)
		.first<{ n: number }>();
	if ((open?.n ?? 0) >= 10)
		return json(
			c,
			problem(409, "Too many open suggestions", "Wait for the moderators"),
		);

	const locale = await c.env.DB.prepare(
		"SELECT locale FROM members WHERE id = ?",
	)
		.bind(member.id)
		.first<{ locale: string }>();

	const id = ulid();
	await c.env.DB.prepare(
		`INSERT INTO tag_proposals
		   (id, community_id, proposed_by, namespace, namespace_label, label, locale, work_id, status, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
	)
		.bind(
			id,
			member.communityId,
			member.id,
			namespace ?? null,
			namespaceLabel ?? null,
			label,
			locale?.locale ?? "en",
			workId ?? null,
			now(),
		)
		.run();
	return c.json({ id, status: "pending" }, 201);
});

/** My own suggestions, so the book page can say where one got to. */
tags.get("/v1/me/tag-proposals", async (c) => {
	const member = await viewer(c);
	if (!member) return json(c, problem(401, "Not signed in"));
	if (!member.scopes.includes("catalogue:read")) return denied(c, true);
	return c.json({
		proposals: await list(c.env, member.communityId, { memberId: member.id }),
	});
});

tags.get("/v1/admin/tag-proposals", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	return c.json({ proposals: await list(c.env, who.communityId, {}) });
});

/**
 * Approving is an edit: the moderator settles the slug and both labels, because
 * a suggestion arrives in one language and the vocabulary needs two.
 */
tags.post("/v1/admin/tag-proposals/:id/approve", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = ApproveTag.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid approval"));
	const { value, labels, namespaceLabels } = parsed.data;

	const proposal = await c.env.DB.prepare(
		`SELECT id, namespace, namespace_label, work_id, proposed_by
		   FROM tag_proposals WHERE id = ? AND community_id = ? AND status = 'pending'`,
	)
		.bind(c.req.param("id"), who.communityId)
		.first<{
			id: string;
			namespace: string | null;
			namespace_label: string | null;
			work_id: string | null;
			proposed_by: string;
		}>();
	if (!proposal) return json(c, problem(404, "No open suggestion"));

	const namespace = parsed.data.namespace ?? proposal.namespace;
	if (!namespace)
		return json(c, problem(422, "Invalid approval", "name the label"));

	const made = await ensureTag(c.env, {
		namespace,
		namespaceLabels,
		value,
		labels,
		createdBy: proposal.proposed_by,
		communityId: who.communityId,
	});
	if ("problem" in made)
		return json(c, problem(422, "Invalid approval", made.problem));
	const { slug } = made;
	const tagId = made.id;

	const statements = [
		c.env.DB.prepare(
			`UPDATE tag_proposals SET status = 'approved', tag_id = ?, decided_at = ?, decided_by = ?
			  WHERE id = ?`,
		).bind(tagId, now(), who.id, proposal.id),
	];
	// The suggestion came from a book; approving puts it on that book.
	if (proposal.work_id) {
		statements.push(
			c.env.DB.prepare(
				"INSERT OR IGNORE INTO work_tags (work_id, tag, added_by, created_at) VALUES (?, ?, ?, ?)",
			).bind(proposal.work_id, slug, proposal.proposed_by, now()),
		);
	}
	await c.env.DB.batch(statements);
	await forget(c.env, vocabularyKey(who.communityId));
	return c.json({ tag: slug }, 201);
});

tags.post("/v1/admin/tag-proposals/:id/decline", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = DeclineTag.safeParse(
		(await c.req.json().catch(() => null)) ?? {},
	);
	if (!parsed.success) return json(c, problem(422, "Invalid decision"));
	const result = await c.env.DB.prepare(
		`UPDATE tag_proposals SET status = 'declined', note = ?, decided_at = ?, decided_by = ?
		  WHERE id = ? AND community_id = ? AND status = 'pending'`,
	)
		.bind(
			parsed.data.note ?? null,
			now(),
			who.id,
			c.req.param("id"),
			who.communityId,
		)
		.run();
	return result.meta.changes
		? c.body(null, 204)
		: json(c, problem(404, "No open suggestion"));
});

/**
 * The moderators' tagging queue: this community's books one at a time, in
 * title order. "untagged" keeps only books with no tag but their language,
 * which listing sets on its own.
 */
tags.get("/v1/admin/tagging", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	return c.json(
		await taggingStep(
			c.env,
			who.communityId,
			c.req.query("only"),
			c.req.query("at"),
		),
	);
});

/** The same queue for a member: only the books on their own shelf. */
tags.get("/v1/me/tagging", async (c) => {
	const { member, forbidden } = await viewerWith(c, "shelf:read");
	if (!member) return denied(c, forbidden);
	return c.json(
		await taggingStep(
			c.env,
			member.communityId,
			c.req.query("only"),
			c.req.query("at"),
			member.id,
		),
	);
});

/** Rename or relabel a tag. The slug is what work_tags stores, so both move. */
tags.patch("/v1/admin/tags/:slug", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = ApproveTag.partial().safeParse(
		await c.req.json().catch(() => null),
	);
	if (!parsed.success) return json(c, problem(422, "Invalid tag"));
	const old = c.req.param("slug");
	const row = await c.env.DB.prepare(
		`SELECT t.id, t.namespace, t.value, t.label_en, t.label_he, t.builtin
		   FROM tags t WHERE t.slug = ? AND ${TAG_IN_COMMUNITY}`,
	)
		.bind(old, who.communityId)
		.first<{
			id: string;
			namespace: string;
			value: string;
			label_en: string;
			label_he: string;
			builtin: number;
		}>();
	if (!row) return json(c, problem(404, "No such tag"));
	// A tag other communities use too is theirs as much as this one's.
	if (await tagSharedWith(c.env, row, who.communityId))
		return json(
			c,
			problem(409, "Shared tag", "Other communities use this tag too"),
		);

	const value = parsed.data.value ?? row.value;
	const slug = `${row.namespace}:${value}`;
	if (slug !== old) {
		// A language's name is the one new books are given from their ISBN
		// (tags.ts, languageTag): renamed, they would get a tag that is gone.
		if (row.builtin && row.namespace === "language")
			return json(
				c,
				problem(409, "Built-in tag", "Its labels can change, not its name"),
			);
		const taken = await c.env.DB.prepare("SELECT 1 FROM tags WHERE slug = ?")
			.bind(slug)
			.first();
		if (taken)
			return json(c, problem(409, "Name taken", "Another tag has that name"));
	}
	await c.env.DB.batch([
		c.env.DB.prepare(
			"UPDATE tags SET value = ?, slug = ?, label_en = ?, label_he = ? WHERE id = ?",
		).bind(
			value,
			slug,
			parsed.data.labels?.en ?? row.label_en,
			parsed.data.labels?.he ?? row.label_he,
			row.id,
		),
		c.env.DB.prepare("UPDATE work_tags SET tag = ? WHERE tag = ?").bind(
			slug,
			old,
		),
	]);
	await forget(c.env, vocabularyKey(who.communityId));
	return c.json({ tag: slug });
});

/**
 * A moderator adding to the vocabulary directly. Suggestions are how members
 * ask; a moderator does not need to ask. Same result as approving one.
 */
tags.post("/v1/admin/tags", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = CreateTag.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid tag"));
	const made = await ensureTag(c.env, {
		...parsed.data,
		createdBy: who.id,
		communityId: who.communityId,
	});
	if ("problem" in made)
		return json(c, problem(422, "Invalid tag", made.problem));
	if (!made.created) return json(c, problem(409, "Already a tag", made.slug));
	await forget(c.env, vocabularyKey(who.communityId));
	return c.json({ tag: made.slug }, 201);
});

/**
 * Take a tag out of this community's vocabulary, and off this community's
 * books. Where other communities use it too, it stays theirs, and so do their
 * books' tags; once no community has it, it is gone. The built-in ones stay:
 * listing a book tags its language with them.
 */
tags.delete("/v1/admin/tags/:slug", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const slug = c.req.param("slug");
	const row = await c.env.DB.prepare(
		`SELECT t.id, t.builtin FROM tags t WHERE t.slug = ? AND ${TAG_IN_COMMUNITY}`,
	)
		.bind(slug, who.communityId)
		.first<{ id: string; builtin: number }>();
	if (!row) return json(c, problem(404, "No such tag"));
	if (row.builtin)
		return json(
			c,
			problem(409, "Built in", "The library uses this tag itself"),
		);
	if (await tagSharedWith(c.env, row, who.communityId)) {
		await c.env.DB.batch([
			c.env.DB.prepare(
				"DELETE FROM tag_communities WHERE tag_id = ? AND community_id = ?",
			).bind(row.id, who.communityId),
			// Off this community's books, unless another community that still
			// has the tag shares the book.
			c.env.DB.prepare(
				`DELETE FROM work_tags
				  WHERE tag = ?1
				    AND work_id IN (SELECT work_id FROM work_communities WHERE community_id = ?2)
				    AND work_id NOT IN (
				      SELECT wc.work_id FROM work_communities wc
				        JOIN tag_communities tc ON tc.community_id = wc.community_id
				       WHERE tc.tag_id = ?3 AND wc.community_id != ?2)`,
			).bind(slug, who.communityId, row.id),
		]);
		await forget(c.env, vocabularyKey(who.communityId));
		return c.body(null, 204);
	}
	await c.env.DB.batch([
		c.env.DB.prepare("DELETE FROM tag_communities WHERE tag_id = ?").bind(
			row.id,
		),
		c.env.DB.prepare("DELETE FROM work_tags WHERE tag = ?").bind(
			c.req.param("slug"),
		),
		// The suggestion that made it stays in the record, pointing nowhere.
		c.env.DB.prepare(
			"UPDATE tag_proposals SET tag_id = NULL WHERE tag_id = ?",
		).bind(row.id),
		c.env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(row.id),
	]);
	await forget(c.env, vocabularyKey(who.communityId));
	return c.body(null, 204);
});

/** Rename a label group in either language. Its slug stays: books use it. */
tags.patch("/v1/admin/tag-namespaces/:id", async (c) => {
	const who = await moderator(c);
	if (!who) return json(c, problem(403, "Moderators only"));
	const parsed = EditNamespace.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return json(c, problem(422, "Invalid label"));
	// A group other communities' tags sit in is theirs to name too.
	const shared = await c.env.DB.prepare(
		`SELECT 1 AS yes FROM tags t JOIN tag_communities tc ON tc.tag_id = t.id
		  WHERE t.namespace = ? AND tc.community_id != ? LIMIT 1`,
	)
		.bind(c.req.param("id"), who.communityId)
		.first();
	if (shared)
		return json(
			c,
			problem(409, "Shared label", "Other communities use this label too"),
		);
	const result = await c.env.DB.prepare(
		"UPDATE tag_namespaces SET label_en = ?, label_he = ? WHERE id = ?",
	)
		.bind(parsed.data.labels.en, parsed.data.labels.he, c.req.param("id"))
		.run();
	if (!result.meta.changes) return json(c, problem(404, "No such label"));
	await forget(c.env, vocabularyKey(who.communityId));
	return c.body(null, 204);
});

/** Whether the member holds a copy of the book, and whether they moderate it. */
async function mayTag(
	env: Env,
	workId: string,
	memberId: string,
	communityId: string,
	asModerator: boolean,
): Promise<{ owns: boolean; moderates: boolean }> {
	const row = await env.DB.prepare(
		`SELECT EXISTS (SELECT 1 FROM copies c JOIN editions e ON e.id = c.edition_id
		                 WHERE e.work_id = ?1 AND c.owner_id = ?2 AND c.state != 'retired') AS owns,
		        EXISTS (SELECT 1 FROM memberships m
		                  JOIN work_communities wc ON wc.work_id = ?1 AND wc.community_id = m.community_id
		                 WHERE ?3 AND m.member_id = ?2 AND m.community_id = ?4
		                   AND m.role IN ('moderator', 'admin')) AS moderates`,
	)
		.bind(workId, memberId, asModerator ? 1 : 0, communityId)
		.first<{ owns: number; moderates: number }>();
	return { owns: Boolean(row?.owns), moderates: Boolean(row?.moderates) };
}

async function list(
	env: Env,
	communityId: string,
	filter: { memberId?: string },
): Promise<TagProposal[]> {
	const { results } = await env.DB.prepare(
		`SELECT p.id, p.status, p.namespace, p.namespace_label, p.label, p.locale, p.note,
		        p.created_at, p.decided_at, t.slug AS tag,
		        m.id AS member_id, m.display_name, w.id AS work_id, w.title
		   FROM tag_proposals p
		   JOIN members m ON m.id = p.proposed_by
		   LEFT JOIN tags t ON t.id = p.tag_id
		   LEFT JOIN works w ON w.id = p.work_id
		  WHERE p.community_id = ?${filter.memberId ? " AND p.proposed_by = ?" : ""}
		  ORDER BY (p.status = 'pending') DESC, p.created_at DESC LIMIT 100`,
	)
		.bind(...[communityId, ...(filter.memberId ? [filter.memberId] : [])])
		.all<Row>();
	return results.map((row) => ({
		id: row.id,
		status: row.status,
		namespace: row.namespace,
		namespaceLabel: row.namespace_label,
		label: row.label,
		locale: row.locale === "he" ? "he" : "en",
		note: row.note,
		tag: row.tag,
		proposedBy: { id: row.member_id, displayName: row.display_name },
		work: row.work_id ? { id: row.work_id, title: row.title ?? "" } : null,
		createdAt: row.created_at,
		decidedAt: row.decided_at,
	}));
}

interface Row {
	id: string;
	status: TagProposal["status"];
	namespace: string | null;
	namespace_label: string | null;
	label: string;
	locale: string;
	note: string | null;
	created_at: number;
	decided_at: number | null;
	tag: string | null;
	member_id: string;
	display_name: string;
	work_id: string | null;
	title: string | null;
}

/**
 * The tag a moderator settled on, created if it is new — and its label group,
 * if that is new too. Shared by approving a member's suggestion and by a
 * moderator adding one directly, so both paths make exactly the same thing.
 */
async function ensureTag(
	env: Env,
	input: {
		namespace: string;
		namespaceLabels?: { en: string; he: string } | undefined;
		value: string;
		labels: { en: string; he: string };
		createdBy: string;
		/** The community it is added for; others may already have it. */
		communityId: string;
	},
): Promise<
	{ id: string; slug: string; created: boolean } | { problem: string }
> {
	const { namespace, namespaceLabels, value, labels } = input;
	const existingNamespace = await env.DB.prepare(
		"SELECT id FROM tag_namespaces WHERE id = ?",
	)
		.bind(namespace)
		.first();
	if (!existingNamespace) {
		if (!namespaceLabels) return { problem: "a new label needs both names" };
		const next = await env.DB.prepare(
			"SELECT coalesce(max(position), 0) + 10 AS position FROM tag_namespaces",
		).first<{ position: number }>();
		await env.DB.prepare(
			`INSERT INTO tag_namespaces (id, label_en, label_he, builtin, position, created_at)
			 VALUES (?, ?, ?, 0, ?, ?)`,
		)
			.bind(
				namespace,
				namespaceLabels.en,
				namespaceLabels.he,
				next?.position ?? 100,
				now(),
			)
			.run();
	}

	const slug = `${namespace}:${value}`;
	const clash = await env.DB.prepare(
		"SELECT id, builtin FROM tags WHERE slug = ?",
	)
		.bind(slug)
		.first<{ id: string; builtin: number }>();
	if (clash) {
		// Another community's tag: this one takes it up too. Already here, or
		// built in: nothing to add.
		if (clash.builtin) return { id: clash.id, slug, created: false };
		const joined = await env.DB.prepare(
			"INSERT OR IGNORE INTO tag_communities (tag_id, community_id, created_at) VALUES (?, ?, ?)",
		)
			.bind(clash.id, input.communityId, now())
			.run();
		return { id: clash.id, slug, created: Boolean(joined.meta.changes) };
	}

	const id = ulid();
	const next = await env.DB.prepare(
		"SELECT coalesce(max(position), 0) + 10 AS position FROM tags WHERE namespace = ?",
	)
		.bind(namespace)
		.first<{ position: number }>();
	await env.DB.batch([
		env.DB.prepare(
			`INSERT INTO tags (id, namespace, value, slug, label_en, label_he, builtin, position, created_at, created_by)
			 VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
		).bind(
			id,
			namespace,
			value,
			slug,
			labels.en,
			labels.he,
			next?.position ?? 100,
			now(),
			input.createdBy,
		),
		env.DB.prepare(
			"INSERT INTO tag_communities (tag_id, community_id, created_at) VALUES (?, ?, ?)",
		).bind(id, input.communityId, now()),
	]);
	return { id, slug, created: true };
}

/**
 * One book of a tagging queue and its place in it: this community's books,
 * or one member's, in title order. "untagged" keeps only books with no tag
 * but their language, which listing sets on its own; "missing:<group>" only
 * books with nothing in that group.
 */
async function taggingStep(
	env: Env,
	communityId: string,
	onlyParam: string | undefined,
	atParam: string | undefined,
	ownerId?: string,
): Promise<TaggingStep> {
	const only = taggingOnly(onlyParam);
	const group = missingGroup(only);
	const at = Math.max(0, Number(atParam ?? 0) || 0);
	// ?3 is the owner and ?4 the group's tags; D1 wants a value for every
	// placeholder up to the highest, so an unused ?3 is filled with "".
	const extra = group
		? [ownerId ?? "", `${group}:%`]
		: ownerId
			? [ownerId]
			: [];
	// A member's own books, or every book in the community for a moderator.
	const mine = ownerId ? "AND cp.owner_id = ?3" : "";
	const filter =
		only === "untagged"
			? `AND NOT EXISTS (SELECT 1 FROM work_tags wt
			     WHERE wt.work_id = w.id AND wt.tag NOT LIKE 'language:%')`
			: group
				? `AND NOT EXISTS (SELECT 1 FROM work_tags wt
				     WHERE wt.work_id = w.id AND wt.tag LIKE ?4)`
				: "";
	// Books with a copy on this community's shelves, not every book it ever named.
	const scope = `FROM works w
	  JOIN work_communities wc ON wc.work_id = w.id AND wc.community_id = ?1
	 WHERE EXISTS (SELECT 1 FROM editions e JOIN copies cp ON cp.edition_id = e.id
	                 JOIN copy_shares cs ON cs.copy_id = cp.id
	                WHERE e.work_id = w.id AND cs.community_id = ?1 AND cp.state != 'retired' ${mine})
	   ${filter}`;
	const [count, row] = await Promise.all([
		// D1 wants as many values as the highest placeholder: ?2 (the offset,
		// unused here) is filled only when ?3, the owner, is in the query.
		env.DB.prepare(`SELECT count(*) AS n ${scope}`)
			.bind(communityId, ...(extra.length ? [0, ...extra] : []))
			.first<{ n: number }>(),
		env.DB.prepare(
			`SELECT w.id, w.title, w.authors,
			        (SELECT e.cover_url FROM editions e
			          WHERE e.work_id = w.id AND e.cover_url IS NOT NULL LIMIT 1) AS cover_url
			   ${scope}
			  ORDER BY w.title COLLATE NOCASE, w.id
			  LIMIT 1 OFFSET ?2`,
		)
			.bind(communityId, at, ...extra)
			.first<{
				id: string;
				title: string;
				authors: string;
				cover_url: string | null;
			}>(),
	]);
	const step: TaggingStep = {
		total: count?.n ?? 0,
		at,
		work: row
			? {
					id: row.id,
					title: row.title,
					authors: JSON.parse(row.authors) as string[],
					coverUrl: row.cover_url,
					tags: await tagsForWork(env, row.id),
				}
			: null,
	};
	return step;
}
