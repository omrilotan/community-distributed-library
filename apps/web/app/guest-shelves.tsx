import type { PublicListing, PublicShelves, Vocabulary } from "@cdl/contracts";
import { parseTags } from "@cdl/contracts";
import { core } from "../lib/core.ts";
import { coverTransition } from "../lib/cover-transition.ts";
import type { Locale, Strings } from "../lib/i18n.ts";
import { MembersOnly } from "./members-only.tsx";
import { MoreButton } from "./more-button.tsx";
import { PlainCover } from "./plain-cover.tsx";
import { Empty } from "./ui.tsx";
import { TagChips } from "./tag-chips.tsx";
import {
	FilterBar,
	SelectedTags,
	SuggestedTags,
	TagFilter,
	collapseFull,
} from "./tags.tsx";

/** How many books a page shows, and the most one page draws. */
const PAGE = 24;
const MOST = 240;

const NO_VOCABULARY: Vocabulary = { namespaces: [], tags: [] };

type Sort = "new" | "title";

/**
 * The front door for somebody not signed in: what the library is and the way
 * in, kept to the top of the screen, and under it the shelves themselves —
 * every book by title, author and cover, nothing about who has it. A book
 * opens a note that borrowing is for members, not its page.
 */
export async function GuestShelves({
	params,
	words,
	locale,
	t,
}: {
	params: {
		q?: string | undefined;
		offset?: string | undefined;
		limit?: string | undefined;
		shown?: string | undefined;
		tags?: string | undefined;
		sort?: string | undefined;
	};
	words: { name: string; tagline: string | null };
	locale: Locale;
	t: Strings;
}) {
	const q = params.q?.trim() || undefined;
	const sort: Sort = params.sort === "title" ? "title" : "new";
	const at = Number(params.offset ?? 0) || 0;
	const asked = Number(params.limit ?? params.shown ?? 0) || 0;
	const size = Math.min(Math.max(asked || PAGE, PAGE), MOST);

	const [vocab, listing] = await Promise.all([
		core<Vocabulary>("/v1/public/tags", { token: null }).then((reply) =>
			reply.status === 200 ? reply.body : NO_VOCABULARY,
		),
		(async () => {
			const query = new URLSearchParams({
				offset: String(at),
				limit: String(size),
			});
			if (q) query.set("q", q);
			if (sort !== "new") query.set("sort", sort);
			const tags = parseTags(params.tags);
			if (tags.length) query.set("tags", tags.join(","));
			return core<PublicShelves>(`/v1/public/shelves?${query}`, {
				token: null,
			});
		})(),
	]);
	const selected = collapseFull(vocab, parseTags(params.tags));
	const results = listing.status === 200 ? listing.body.results : [];
	const total = listing.status === 200 ? listing.body.total : 0;
	const nextOffset = listing.status === 200 ? listing.body.nextOffset : null;

	// What a tag link carries along, and what the order links carry along.
	const keep = { q, ...(sort === "new" ? {} : { sort }) };
	const query = {
		...(q ? { q } : {}),
		...(sort === "new" ? {} : { sort }),
		...(selected.length ? { tags: selected.join(",") } : {}),
	};
	const orderHref = (next: Sort) => {
		const search = new URLSearchParams();
		if (q) search.set("q", q);
		if (selected.length) search.set("tags", selected.join(","));
		if (next !== "new") search.set("sort", next);
		const text = search.toString();
		return text ? `/?${text}` : "/";
	};
	const narrowed = Boolean(q || selected.length);

	return (
		<main className="guest">
			{/* The front door, kept short: a phone shows books before it scrolls. */}
			<section className="guest-intro">
				<div className="guest-copy">
					<h1>{words.name || t.appShort}</h1>
					{words.tagline ? <p className="guest-lede">{words.tagline}</p> : null}
					<div className="front-actions">
						<a className="btn" href="/login">
							{t.signIn}
						</a>
						<a className="btn secondary" href="/about">
							{t.aboutLibrary}
						</a>
					</div>
				</div>
				<p className="guest-invite">
					<strong>{t.landingInviteTitle}.</strong> {t.landingInviteShort}
				</p>
			</section>

			<form action="/" method="get" role="search" className="search">
				<input
					id="q"
					name="q"
					type="search"
					dir="auto"
					defaultValue={q ?? ""}
					placeholder={t.searchPlaceholder}
					aria-label={t.search}
				/>
				<button type="submit">{t.search}</button>
			</form>

			<TagChips />
			<FilterBar
				filters={
					<TagFilter
						vocab={vocab}
						selected={selected}
						params={keep}
						locale={locale}
						labels={{ filter: t.filters, clear: t.clearFilters }}
						others={sort === "new" ? 0 : 1}
					>
						<div className="listing-controls">
							<div className="filter-row" role="group" aria-label={t.sortBy}>
								<span className="muted">{t.sortBy}</span>
								<div className="filter-chips">
									{(
										[
											["new", t.sortNew],
											["title", t.sortTitle],
										] as const
									).map(([option, label]) => (
										<a
											className="chip"
											key={option}
											href={orderHref(option)}
											aria-current={sort === option ? "true" : undefined}
											data-param="sort"
											data-value={option === "new" ? "" : option}
											rel="nofollow"
										>
											{label}
										</a>
									))}
								</div>
							</div>
						</div>
					</TagFilter>
				}
			>
				<SelectedTags
					vocab={vocab}
					selected={selected}
					params={keep}
					locale={locale}
				/>
				<SuggestedTags
					vocab={vocab}
					selected={selected}
					params={keep}
					locale={locale}
				/>
			</FilterBar>

			<div className="page-head">
				<h2>{q ? t.resultsFor(q) : t.guestShelves}</h2>
				<span className="muted listing-total">{t.booksTotal(total)}</span>
			</div>
			{results.length === 0 && narrowed ? (
				<Empty title={t.noResults} action={{ href: "/", label: t.allBooks }} />
			) : null}

			<div className="grid" id="listing">
				{results.map((listing) => (
					<GuestCard key={listing.work.id} listing={listing} />
				))}
			</div>

			{nextOffset !== null ? (
				<MoreButton
					query={query}
					shown={at + size}
					pageSize={PAGE}
					most={MOST}
					label={t.more}
					loading={t.loadingMore}
				/>
			) : null}

			<MembersOnly
				labels={{
					title: t.membersOnlyTitle,
					body: t.membersOnlyBody,
					signIn: t.membersOnlySignIn,
					about: t.aboutLibrary,
					keepLooking: t.keepLooking,
				}}
			/>
		</main>
	);
}

/**
 * A book as a visitor sees it: cover, title, author. A button, not a link:
 * it opens the note that borrowing is for members, which works without
 * script too (a popover).
 */
function GuestCard({ listing }: { listing: PublicListing }) {
	const { work, edition } = listing;
	return (
		<button
			type="button"
			className="tile tile-guest"
			popoverTarget="members-only"
			data-title={edition.title}
			data-authors={work.authors.join(", ")}
			data-cover={edition.coverUrl ?? ""}
		>
			<span className="tile-cover" style={coverTransition(work.id)}>
				{edition.coverUrl ? (
					<img alt="" src={edition.coverUrl} loading="lazy" />
				) : (
					<PlainCover title={edition.title} authors={work.authors} />
				)}
			</span>
			<bdi className="tile-title">{edition.title}</bdi>
			<bdi className="muted">{work.authors.join(", ")}</bdi>
		</button>
	);
}
