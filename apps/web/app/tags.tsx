import type { TagDefinition, Vocabulary } from "@cdl/contracts";
import { Funnel } from "@phosphor-icons/react/dist/ssr/Funnel";
import type { Locale } from "../lib/i18n.ts";

/** The vocabulary comes from core; nothing about tags is compiled in. */
export type Vocab = Vocabulary;

const byNamespace = (vocab: Vocab, only?: (tag: TagDefinition) => boolean) =>
	vocab.namespaces
		.map((namespace) => ({
			namespace,
			tags: vocab.tags.filter(
				(tag) => tag.namespace === namespace.id && (!only || only(tag)),
			),
		}))
		.filter((group) => group.tags.length > 0);

/** The tags the vocabulary knows, in its own order. Anything else is not shown. */
function known(vocab: Vocab, slugs: string[]): TagDefinition[] {
	return vocab.tags.filter((tag) => slugs.includes(tag.slug));
}

/**
 * Every value of a group chosen is the same as none of them: the group no
 * longer narrows anything. Fold such a group away, so the chips say what the
 * filter does and the address stays short.
 */
export function collapseFull(vocab: Vocab, selected: string[]): string[] {
	const chosen = new Set(selected);
	const full = new Set<string>();
	for (const namespace of vocab.namespaces) {
		const offered = vocab.tags.filter(
			(tag) =>
				tag.namespace === namespace.id &&
				(tag.works > 0 || chosen.has(tag.slug)),
		);
		if (offered.length && offered.every((tag) => chosen.has(tag.slug)))
			full.add(namespace.id);
	}
	if (full.size === 0) return selected;
	return selected.filter(
		(slug) =>
			!full.has(vocab.tags.find((tag) => tag.slug === slug)?.namespace ?? ""),
	);
}

function tagsHref(
	params: Record<string, string | undefined>,
	tags: string[],
): string {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value) query.set(key, value);
	}
	if (tags.length) query.set("tags", tags.join(","));
	const search = query.toString();
	return search ? `/?${search}` : "/";
}

/**
 * Filter chips. Plain links that toggle themselves in the query string: no
 * JavaScript, bookmarkable, and the append-paging link inherits the filter.
 */
function toggleHref(
	vocab: Vocab,
	params: Record<string, string | undefined>,
	selected: string[],
	slug: string,
): string {
	const chosen = new Set(selected);
	const next = chosen.has(slug)
		? selected.filter((one) => one !== slug)
		: [...selected, slug];
	return tagsHref(params, collapseFull(vocab, next));
}

/**
 * What the shelves are narrowed to right now, each chip a tap from coming
 * off, with the one-tap filters at the end. The choosing happens in Filters.
 */
export function SelectedTags({
	vocab,
	selected,
	params,
	locale,
	children,
}: {
	vocab: Vocab;
	selected: string[];
	params: Record<string, string | undefined>;
	locale: Locale;
	/** One-tap filters, at the end of the same row. */
	children?: React.ReactNode;
}) {
	const tags = known(vocab, selected);
	if (tags.length === 0 && !children) return null;
	return (
		<div className="quick-tags">
			{tags.map((tag) => (
				<a
					className="chip"
					key={tag.slug}
					href={toggleHref(vocab, params, selected, tag.slug)}
					aria-current="true"
					data-tag={tag.slug}
					rel="nofollow"
				>
					{tag.labels[locale]}
				</a>
			))}
			{children}
		</div>
	);
}

/** How many unchosen tags the row beside Filters suggests. */
const SUGGESTED = 8;

/**
 * The tags most books carry, not chosen yet: a tap from narrowing the
 * shelves without opening Filters. After what is chosen, in the same row.
 */
export function SuggestedTags({
	vocab,
	selected,
	params,
	locale,
}: {
	vocab: Vocab;
	selected: string[];
	params: Record<string, string | undefined>;
	locale: Locale;
}) {
	const chosen = new Set(selected);
	// Only a tag that narrows: the one value a group has in use, chosen,
	// is no filter at all (collapseFull), and a chip that does nothing is a lie.
	const tags = vocab.tags
		.filter(
			(tag) =>
				tag.works > 0 &&
				!chosen.has(tag.slug) &&
				collapseFull(vocab, [...selected, tag.slug]).includes(tag.slug),
		)
		.sort((a, b) => b.works - a.works)
		.slice(0, SUGGESTED);
	if (tags.length === 0) return null;
	return (
		<div className="quick-suggest">
			{tags.map((tag) => (
				<a
					className="chip"
					key={tag.slug}
					href={toggleHref(vocab, params, selected, tag.slug)}
					data-tag={tag.slug}
					rel="nofollow"
				>
					{tag.labels[locale]}
				</a>
			))}
		</div>
	);
}

/**
 * Filters, and beside it in one row what is chosen and a few tags to tap:
 * the row scrolls sideways on a phone rather than pushing the books down.
 * The panel opens over the shelves, under the row.
 */
export function FilterBar({
	filters,
	children,
}: {
	/** The Filters disclosure. */
	filters: React.ReactNode;
	/** The chips beside it. */
	children?: React.ReactNode;
}) {
	return (
		<div className="filter-bar">
			{filters}
			<div className="filter-strip">{children}</div>
		</div>
	);
}

export function TagFilter({
	vocab,
	selected,
	params,
	locale,
	labels,
	others = 0,
	children,
}: {
	vocab: Vocab;
	selected: string[];
	/** The current query, without `tags` or `offset`. */
	params: Record<string, string | undefined>;
	locale: Locale;
	labels: { filter: string; clear: string };
	/** How many of the other settings below are off their defaults. */
	others?: number;
	/** The rest of what narrows or orders the shelves, below the tags. */
	children?: React.ReactNode;
}) {
	const chosen = new Set(selected);
	// Only offer what somebody has listed, plus whatever is already on.
	const offered = byNamespace(
		vocab,
		(tag) => tag.works > 0 || chosen.has(tag.slug),
	);
	if (offered.length === 0 && !children) return null;

	const href = (tags: string[]) => tagsHref(params, tags);
	const toggle = (slug: string) => toggleHref(vocab, params, selected, slug);

	// Closed whatever is set, also right after a choice made in it: the row
	// beside it says what is chosen, and the page that comes back is for the
	// books.
	return (
		<details className="filters">
			<summary>
				<Funnel size={16} aria-hidden="true" />
				{labels.filter}
				{selected.length + others ? (
					<span className="filters-count">{selected.length + others}</span>
				) : null}
			</summary>
			<div className="filters-panel">
				{offered.map((group) => (
					<div className="filter-row" key={group.namespace.id}>
						<span className="muted">{group.namespace.labels[locale]}</span>
						<div className="filter-chips">
							{group.tags.map((tag) => (
								<a
									className="chip"
									key={tag.slug}
									href={toggle(tag.slug)}
									aria-current={chosen.has(tag.slug) ? "true" : undefined}
									data-tag={tag.slug}
									rel="nofollow"
								>
									{tag.labels[locale]}
								</a>
							))}
						</div>
					</div>
				))}
				{children}
				{selected.length ? (
					<p>
						<a className="link" href={href([])}>
							{labels.clear}
						</a>
					</p>
				) : null}
			</div>
		</details>
	);
}

/** Read-only chips, for a book page or a shelf row. */
export function TagChips({
	vocab,
	tags,
	locale,
	link = true,
}: {
	vocab: Vocab;
	tags: string[];
	locale: Locale;
	link?: boolean;
}) {
	// A retired tag, or a vocabulary that failed to load, shows nothing rather
	// than a raw `namespace:value` slug.
	const shown = known(vocab, tags);
	if (shown.length === 0) return null;
	return (
		<p className="chips">
			{shown.map((tag) =>
				link ? (
					<a className="chip" key={tag.slug} href={`/?tags=${tag.slug}`}>
						{tag.labels[locale]}
					</a>
				) : (
					<span className="chip" key={tag.slug}>
						{tag.labels[locale]}
					</span>
				),
			)}
		</p>
	);
}

/** Tick boxes for the add and edit forms, grouped by label. */
export function TagPicker({
	vocab,
	name = "tags",
	selected = [],
	locale,
	legend,
}: {
	vocab: Vocab;
	name?: string;
	selected?: string[];
	locale: Locale;
	legend: string;
}) {
	const chosen = new Set(selected);
	const groups = byNamespace(vocab);
	return (
		<fieldset className="tag-picker">
			<legend className="muted">{legend}</legend>
			{groups.map((group) => (
				<div className="filter-row" key={group.namespace.id}>
					{/* One group (a things library's categories): the legend names it. */}
					{groups.length > 1 ? (
						<span className="muted">{group.namespace.labels[locale]}</span>
					) : null}
					<div className="filter-chips">
						{group.tags.map((tag) => (
							<label className="chip chip-check" key={tag.slug}>
								<input
									type="checkbox"
									name={name}
									value={tag.slug}
									defaultChecked={chosen.has(tag.slug)}
								/>
								<span>{tag.labels[locale]}</span>
							</label>
						))}
					</div>
				</div>
			))}
		</fieldset>
	);
}

/**
 * Suggest what the vocabulary lacks. A moderator turns the words into a slug and
 * a label in both languages, so nothing here needs the member to know either.
 */
export function SuggestTag({
	vocab,
	locale,
	workId,
	back,
	labels,
}: {
	vocab: Vocab;
	locale: Locale;
	workId?: string;
	back: string;
	labels: {
		summary: string;
		hint: string;
		label: string;
		value: string;
		newLabel: string;
		newLabelName: string;
		send: string;
	};
}) {
	return (
		<details className="tag-edit">
			<summary className="muted">{labels.summary}</summary>
			<form action="/api/tags/proposals" method="post">
				<input type="hidden" name="back" value={back} />
				{workId ? <input type="hidden" name="workId" value={workId} /> : null}
				<p className="muted">{labels.hint}</p>

				<label htmlFor="suggest-namespace">{labels.label}</label>
				<select id="suggest-namespace" name="namespace" defaultValue="">
					{vocab.namespaces.map((namespace) => (
						<option value={namespace.id} key={namespace.id}>
							{namespace.labels[locale]}
						</option>
					))}
					<option value="">{labels.newLabel}</option>
				</select>

				<label htmlFor="suggest-namespace-label">{labels.newLabelName}</label>
				<input
					id="suggest-namespace-label"
					name="namespaceLabel"
					type="text"
					dir="auto"
					maxLength={40}
				/>

				<label htmlFor="suggest-label">{labels.value}</label>
				<input
					id="suggest-label"
					name="label"
					type="text"
					dir="auto"
					required
					maxLength={40}
				/>

				<button type="submit" className="secondary">
					{labels.send}
				</button>
			</form>
		</details>
	);
}
