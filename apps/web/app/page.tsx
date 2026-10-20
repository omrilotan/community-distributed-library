import { traits } from "@cdl/contracts";
import { libraryType } from "../lib/library-type.ts";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type {
	BrowseResponse,
	SearchResponse,
	WantedWork,
} from "@cdl/contracts";
import { parseTags } from "@cdl/contracts";
import { core } from "../lib/core.ts";
import { strings, type Locale } from "../lib/i18n.ts";
import { libraryWords } from "../lib/library.ts";
import { sessionToken, signedOut } from "../lib/session.ts";
import { requireProfile } from "../lib/profile.ts";
import { vocabulary } from "../lib/vocabulary.ts";
import { WorkCard } from "./copy-card.tsx";
import { Callout, Empty, PageHead } from "./ui.tsx";
import {
	FilterBar,
	SelectedTags,
	SuggestedTags,
	TagFilter,
	collapseFull,
} from "./tags.tsx";
import { GuestShelves } from "./guest-shelves.tsx";
import { TagChips } from "./tag-chips.tsx";
import { MoreButton } from "./more-button.tsx";
import {
	WishedChip,
	OrderControls,
	parseWithin,
	type Sort,
} from "./listing-controls.tsx";

/** How many books a page of the storefront shows. */
const PAGE = 24;
/** The most one page draws (core's own limit): ten of them. */
const MOST = 240;

/**
 * The storefront. Signed in: a search box and, below it, everything that can
 * be requested right now, newest first. Signed out: a short front door, and
 * under it the shelves without anybody's details on them.
 */
/** The front door's own words, in the language it opens in. */
export async function generateMetadata() {
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const words = await libraryWords(locale);
	return {
		title: words.name || strings(locale).appShort,
		description: words.tagline ?? undefined,
	};
}

export default async function StorefrontPage({
	searchParams,
}: {
	searchParams: Promise<{
		q?: string;
		offset?: string;
		error?: string;
		tags?: string;
		shown?: string;
		limit?: string;
		owner?: string;
		sort?: string;
		availableOnly?: string;
		showMine?: string;
		showRead?: string;
		wished?: string;
		within?: string;
	}>;
}) {
	const {
		q,
		offset,
		error,
		tags,
		shown,
		limit,
		owner,
		sort: order,
		availableOnly: only,
		showMine: with_,
		showRead: withRead,
		wished: onlyWished,
		within: radius,
	} = await searchParams;
	const sort: Sort = order === "title" || order === "distance" ? order : "new";
	const availableOnly = only === "1";
	const showMine = with_ === "1";
	const showRead = withRead === "1";
	const wished = onlyWished === "1";
	// No distance limit unless the member picks one.
	const within = parseWithin(radius);
	const selected = parseTags(tags);
	const filter = selected.length
		? `&tags=${encodeURIComponent(selected.join(","))}`
		: "";
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	// What this library's items can do: read marks, asking by name.
	const kind = traits(libraryType());
	const words = await libraryWords(locale);

	if (!(await sessionToken())) {
		return (
			<GuestShelves
				params={{ q, offset, limit, shown, tags, sort: order }}
				words={words}
				locale={locale}
				t={t}
			/>
		);
	}

	// `shown` is how much of the list this page stands for, so returning to it
	// — from a book, or the Back button — brings back everything More uncovered.
	// `offset`/`limit` are the slice "More" fetches to splice in.
	const at = Number(offset ?? 0) || 0;
	const asked = Number(limit ?? shown ?? 0) || 0;
	const size = Math.min(Math.max(asked || PAGE, PAGE), MOST);
	const how = `${sort === "new" ? "" : `&sort=${sort}`}${availableOnly ? "&availableOnly=1" : ""}${showMine ? "&showMine=1" : ""}${showRead ? "&showRead=1" : ""}${wished ? "&wished=1" : ""}${within ? `&within=${within}` : ""}`;
	// The filters just changed (middleware.ts says so): keep them on the
	// member, so their next device opens the shelves the same way.
	const changed = (await headers()).get("x-cdl-browse");
	// Everything the page needs, in one round: the profile check only
	// matters if it fails, and then the rest was cheap to have asked.
	const [me, listing, vocab, wanted] = await Promise.all([
		requireProfile(),
		q
			? core<SearchResponse>(
					`/v1/search?q=${encodeURIComponent(q)}&offset=${at}&limit=${size}${filter}${how}`,
				)
			: core<BrowseResponse>(
					`/v1/browse?offset=${at}&limit=${size}${filter}${how}${owner ? `&owner=${encodeURIComponent(owner)}` : ""}`,
				),
		vocabulary(),
		// Books with a queue and no copy: the front page asks members to list them.
		!q && !owner && !offset
			? core<{ works: WantedWork[] }>("/v1/wanted").then(
					(reply) => reply.body?.works ?? [],
				)
			: Promise.resolve([] as WantedWork[]),
		changed === null
			? null
			: core("/v1/me", {
					method: "PATCH",
					body: JSON.stringify({ browsePrefs: changed || null }),
				}),
	]);
	if (listing.status === 401) signedOut(listing.status);
	// A device that has not seen this member's filters yet (no cookie, a
	// bare address) opens the shelves the way they left them elsewhere.
	const bare =
		!q &&
		!owner &&
		!tags &&
		!order &&
		!only &&
		!with_ &&
		!withRead &&
		!onlyWished &&
		!radius;
	if (
		changed === null &&
		bare &&
		me.browsePrefs &&
		!(await cookies()).get("browse")
	) {
		redirect(`/?${me.browsePrefs}`);
	}
	// Every value of a group is no filter at all; show it that way.
	const narrowed = collapseFull(vocab, selected);
	const results = listing.status === 200 ? listing.body.results : [];
	const total = listing.status === 200 ? listing.body.total : 0;
	const nextOffset = listing.status === 200 ? listing.body.nextOffset : null;
	const query = {
		...(q ? { q } : {}),
		...(owner ? { owner } : {}),
		...(sort === "new" ? {} : { sort }),
		...(availableOnly ? { availableOnly: "1" } : {}),
		...(showMine ? { showMine: "1" } : {}),
		...(showRead ? { showRead: "1" } : {}),
		...(wished ? { wished: "1" } : {}),
		...(within ? { within: String(within) } : {}),
		...(selected.length ? { tags: selected.join(",") } : {}),
	};
	// What a tag link carries along, and what an order link carries along.
	const keep = {
		q,
		...(owner ? { owner } : {}),
		...(sort === "new" ? {} : { sort }),
		...(availableOnly ? { availableOnly: "1" } : {}),
		...(showMine ? { showMine: "1" } : {}),
		...(showRead ? { showRead: "1" } : {}),
		...(wished ? { wished: "1" } : {}),
		...(within ? { within: String(within) } : {}),
	};
	// What narrows the list, and the same list without it: nothing found
	// should be one tap from everything again. The search, whose shelf and
	// the order stay.
	const narrowing =
		selected.length + [wished, availableOnly, within].filter(Boolean).length;
	const unfiltered = (() => {
		const query = new URLSearchParams();
		if (q) query.set("q", q);
		if (owner) query.set("owner", owner);
		if (sort !== "new") query.set("sort", sort);
		const search = query.toString();
		return search ? `/?${search}` : "/";
	})();
	const controls = {
		params: {
			...(q ? { q } : {}),
			...(owner ? { owner } : {}),
			...(selected.length ? { tags: selected.join(",") } : {}),
		},
		sort,
		availableOnly,
		showMine,
		showRead,
		wished,
		within,
	};
	// Whose shelf this is: the name travels on the copies, so take it from one.
	const whose = owner
		? (results
				.flatMap((listing) => listing.copies)
				.find((copy) => copy.owner.id === owner)?.owner.displayName ?? null)
		: null;

	return (
		<main>
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
				{/* A new search keeps the filters; only the words change. */}
				{Object.entries(query)
					.filter(([name]) => name !== "q" && name !== "owner")
					.map(([name, value]) => (
						<input key={name} type="hidden" name={name} value={value} />
					))}
				<button type="submit">{t.search}</button>
			</form>

			{/* One quick row — what the shelves are narrowed to, and the books
			    kept to read — and everything else behind Filters, so a phone's
			    first screen is mostly books. */}
			<TagChips />
			<FilterBar
				filters={
					<TagFilter
						vocab={vocab}
						selected={narrowed}
						params={keep}
						locale={locale}
						labels={{ filter: t.filters, clear: t.clearFilters }}
						others={
							[
								sort !== "new",
								availableOnly,
								showMine,
								showRead,
								within,
							].filter(Boolean).length
						}
					>
						<OrderControls
							{...controls}
							compact={me.community.compact}
							labels={{
								sortBy: t.sortBy,
								sortNew: t.sortNew,
								sortTitle: t.sortTitle,
								sortDistance: t.sortDistance,
								show: t.filterShow,
								available: t.filterAvailable,
								showMine: t.filterShowMine,
								showRead: kind.readMarks ? t.filterShowRead : "",
								distance: t.filterDistance,
								anyDistance: t.anyDistance,
								withinKm: t.withinKm,
							}}
						/>
					</TagFilter>
				}
			>
				<SelectedTags
					vocab={vocab}
					selected={narrowed}
					params={keep}
					locale={locale}
				>
					<WishedChip {...controls} label={t.wishlist} />
				</SelectedTags>
				<SuggestedTags
					vocab={vocab}
					selected={narrowed}
					params={keep}
					locale={locale}
				/>
			</FilterBar>

			<PageHead
				title={
					owner
						? t.booksFrom(whose ?? "")
						: q
							? t.resultsFor(q)
							: t.onTheShelves
				}
				aside={
					// How many books this is: the whole count, however many are shown.
					<>
						<span className="listing-total">{t.booksTotal(total)}</span>
						{owner ? (
							<>
								{" · "}
								<a href="/">{t.allBooks}</a>
							</>
						) : null}
					</>
				}
			/>
			{results.length === 0 ? (
				<Empty
					title={
						wished && !q && !selected.length
							? t.wishlistEmpty
							: q || selected.length || wished
								? t.noResults
								: t.nothingYet
					}
					hint={
						wished && !q && !selected.length
							? t.wishlistEmptyHint
							: q || selected.length || wished
								? undefined
								: t.nothingYetHint
					}
					action={
						narrowing
							? {
									href: unfiltered,
									label: t.removeFilters(narrowing),
								}
							: undefined
					}
				/>
			) : null}
			{error === "wanted" ? (
				<Callout tone="warn">{t.wantedFailed}</Callout>
			) : null}
			{/* Asking for something by name joins it with whatever is listed
			    later under that name: books only, where names mean one thing. */}
			{q && kind.mergeByName ? (
				<details className="wanted-ask" open={results.length === 0}>
					<summary>{t.wantedTitle}</summary>
					<form action="/api/wanted" method="post">
						<p className="muted">{t.wantedHint}</p>
						<p className="form-key">{t.requiredKey}</p>
						<label htmlFor="wanted-title">{t.title}</label>
						<input
							id="wanted-title"
							name="title"
							maxLength={200}
							type="text"
							dir="auto"
							required
							defaultValue={/^\d{13}$/.test(q) ? "" : q}
						/>
						<label htmlFor="wanted-authors">{t.wantedAuthors}</label>
						<input id="wanted-authors" name="authors" type="text" dir="auto" />
						<label htmlFor="wanted-isbn">{t.isbn}</label>
						<input
							id="wanted-isbn"
							name="isbn13"
							type="text"
							inputMode="numeric"
							dir="ltr"
							defaultValue={/^\d{13}$/.test(q) ? q : ""}
						/>
						<button type="submit" className="secondary">
							{t.wantedAsk}
						</button>
					</form>
				</details>
			) : null}

			<div className="grid" id="listing">
				{results.map((listing) => (
					<WorkCard
						key={listing.work.id}
						listing={listing}
						locale={locale}
						t={t}
					/>
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

			{wanted.length ? (
				<section className="wanted">
					<PageHead title={t.lookingFor} />
					<ul className="hooks">
						{wanted.map((work) => (
							<li key={work.workId}>
								<div>
									<a href={`/works/${work.workId}`}>
										<bdi>
											<strong>{work.title}</strong>
										</bdi>
									</a>
									<div className="muted">
										<bdi>{work.authors.join(", ")}</bdi>
										{work.authors.length ? " · " : ""}
										{t.waitingCount(work.waiting)}
									</div>
								</div>
								<a
									className="quiet"
									href={`/shelf/add?${new URLSearchParams({
										...(work.isbn13 ? { isbn: work.isbn13 } : {}),
										title: work.title,
										authors: work.authors.join(", "),
									}).toString()}`}
								>
									{t.haveIt}
								</a>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</main>
	);
}
