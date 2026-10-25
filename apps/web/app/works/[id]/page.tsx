import { coverTransition } from "../../../lib/cover-transition.ts";
import { cache } from "react";
import { cookies } from "next/headers";
import { traits, type WorkCard, type WorkPage } from "@cdl/contracts";
import { libraryType } from "../../../lib/library-type.ts";
import { core } from "../../../lib/core.ts";
import { formatDistance, strings, type Locale } from "../../../lib/i18n.ts";
import { sessionToken, signedOut } from "../../../lib/session.ts";
import { libraryWords } from "../../../lib/library.ts";
import { cardHref } from "../../../lib/card-href.ts";
import { appBase } from "../../../lib/site.ts";
import { SuggestTag, TagChips, TagPicker } from "../../tags.tsx";
import { vocabulary } from "../../../lib/vocabulary.ts";
import { requireProfile } from "../../../lib/profile.ts";
import { moderates, shownRole } from "../../../lib/view-as.ts";
import { AreaMap } from "../../area-map.tsx";
import { Callout, Empty } from "../../ui.tsx";
import { PlainCover } from "../../plain-cover.tsx";
import { ThingFacts } from "../../thing-facts.tsx";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { BookmarkSimple } from "@phosphor-icons/react/dist/ssr/BookmarkSimple";
import { dateFormat } from "../../../lib/dates.ts";
import { AsyncForms } from "../../async-forms.tsx";

/** The public card, once per request: the head and the page both want it. */
const publicCard = cache((id: string) =>
	core<WorkCard>(`/v1/works/${encodeURIComponent(id)}/card`, { token: null }),
);

/** A book's page is named after the book, so a search engine can name it too. */
export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const card = await publicCard(id);
	const name = (await libraryWords(locale)).name || t.appShort;
	if (card.status !== 200) return { title: name };
	const description = [card.body.authors.join(", "), t.ogTagline]
		.filter(Boolean)
		.join(" · ");
	const cover = card.body.coverUrl;
	return {
		title: `${card.body.title} · ${name}`,
		description,
		// The book's own card, in place of the library's.
		openGraph: {
			type: "book",
			siteName: name,
			title: card.body.title,
			description,
			url: `${appBase()}/works/${encodeURIComponent(id)}`,
			// No cover: the library's card, so the link still has a picture.
			images: [
				cover
					? { url: cover }
					: { url: await cardHref(locale), width: 1200, height: 630 },
			],
		},
		twitter: { card: "summary_large_image" },
	};
}

/** A book: what it is, who near you has it, and a way to ask. */
export default async function WorkPageView({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		requested?: string;
		error?: string;
		waitlisted?: string;
		tagged?: string;
		suggested?: string;
		edited?: string;
	}>;
}) {
	const { id } = await params;
	const { requested, error, waitlisted, tagged, suggested, edited } =
		await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	// What this library's items can do: read marks, authors.
	const kind = traits(libraryType());
	const url = `${appBase()}/works/${encodeURIComponent(id)}`;

	// Public card: link previews and visitors without a session see the book, nothing else.
	const cardAsked = publicCard(id);
	const og = (
		<>
			{/* One address for the book, whoever shared it and however. */}
			<link rel="canonical" href={url} />
		</>
	);

	if (!(await sessionToken())) {
		const card = await cardAsked;
		if (card.status !== 200) return <Empty title={t.noSuchBook} />;
		return (
			<main className="book">
				{og}
				{/* React already preloads the cover from the head; "high" asks for
				    it ahead of the scripts, for whoever arrives from a link. */}
				<div className="book-cover">
					{card.body.coverUrl ? (
						<img alt="" src={card.body.coverUrl} fetchPriority="high" />
					) : (
						<PlainCover title={card.body.title} size="book" />
					)}
				</div>
				<div>
					<h1>
						<bdi>{card.body.title}</bdi>
					</h1>
					<p>
						<bdi>{card.body.authors.join(", ")}</bdi>
					</p>
					<p className="muted">
						{t.teaserCounts(card.body.copies, card.body.waiting)}
					</p>
					<p>{t.teaserSignIn}</p>
					<a className="btn" href="/login">
						{t.signIn}
					</a>
					<p className="muted">{t.teaserJoin}</p>
				</div>
			</main>
		);
	}

	// The profile check, the book and the vocabulary in one round, started
	// before the card is read so the two rounds overlap rather than queue.
	const rest = Promise.all([
		requireProfile(),
		core<WorkPage>(`/v1/works/${encodeURIComponent(id)}`),
		vocabulary(),
	]);
	// A missing book answers before these are read; a redirect thrown in them
	// then has nowhere to go, so it is marked handled here and still thrown by
	// the await below.
	rest.catch(() => {});
	const card = await cardAsked;
	if (card.status !== 200) return <Empty title={t.noSuchBook} />;
	const [me, page, vocab] = await rest;
	if (page.status === 401) signedOut(page.status);
	if (page.status !== 200) {
		return <Empty title={t.noSuchBook} />;
	}
	const { work, editions, copies, myWaitlist, read, wished } = page.body;
	// A book with no description of its own often has one in a copy's note
	// (translator, illustrator, edition): offered as the editor's starting
	// value, the viewer's own copy first, and said to be so.
	const noteFromCopy = work.note
		? null
		: ((
				copies.find((copy) => copy.mine && copy.note) ??
				copies.find((copy) => copy.note)
			)?.note ?? null);
	const waiting = card.body.waiting;
	const anyRequestable = copies.some(
		(copy) => !copy.mine && (copy.available || copy.relayable),
	);
	// You own a copy: there is nothing to queue for, whether it is on your
	// shelf or out with somebody who will bring it back to you.
	const ownCopy = copies.some((copy) => copy.mine);
	// Yours already, or asked for: nothing to wait for either.
	const myLoan = copies.some((copy) => copy.myLoanId);
	const date = dateFormat(locale, { dateStyle: "medium" });
	const dateTime = dateFormat(locale, {
		dateStyle: "short",
		timeStyle: "short",
	});
	const cover = editions.find((edition) => edition.coverUrl)?.coverUrl ?? null;
	// What the page offers follows the view the moderator chose.
	const isModerator = moderates(await shownRole(me));
	const edition = editions[0];

	// A thing has up to four photos; the first is already its picture.
	const gallery =
		kind.photos.most > 1
			? (copies.find((copy) => copy.photos.length > 1)?.photos ?? [])
			: [];

	return (
		<main className="book">
			{og}
			{/* Only what names the book sits beside the cover; on a phone there
			    is no room for anything else next to it. */}
			<header className="book-head">
				<div className="book-cover" style={coverTransition(work.id)}>
					{cover ? (
						<img alt="" src={cover} fetchPriority="high" />
					) : (
						<PlainCover title={work.title} size="book" />
					)}
				</div>
				<div>
					<h1>
						<bdi>{work.title}</bdi>
					</h1>
					<p>
						{/* An author is the most likely next search. */}
						{work.authors.map((author, index) => (
							<span key={author}>
								{index ? ", " : ""}
								<a href={`/?q=${encodeURIComponent(author)}`}>
									<bdi>{author}</bdi>
								</a>
							</span>
						))}
					</p>
					<p className="muted">
						{[
							edition?.publisher,
							edition?.publishedYear,
							edition?.pageCount ? t.pages(edition.pageCount) : null,
							edition?.isbn13 ? `${t.isbn} ${edition.isbn13}` : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
					{work.note ? (
						<p className="book-note">
							<bdi>{work.note}</bdi>
						</p>
					) : null}
					<TagChips vocab={vocab} tags={work.tags} locale={locale} />
				</div>
			</header>

			{/* A thing's other photos, after the one beside its name. Each opens
			    whole, at its own address. */}
			{gallery.length > 1 ? (
				<ul className="thing-photos" aria-label={t.photos}>
					{gallery.slice(1).map((url, index) => (
						<li key={url}>
							{/* The second photo on, numbered as a reader counts them. */}
							<a
								href={url}
								target="_blank"
								rel="noopener"
								aria-label={t.photoNumber(index + 2)}
							>
								<img alt="" src={url} loading="lazy" />
							</a>
						</li>
					))}
				</ul>
			) : null}

			{requested ? <Callout>{t.requestSent}</Callout> : null}
			{edited ? <Callout>{t.bookEdited}</Callout> : null}
			{error ? (
				<Callout tone="warn">
					{{
						taken: t.requestTaken,
						away: t.requestAway,
						limit: t.requestLimit,
						hold: t.requestHold,
						count: t.requestCount,
						asked: t.requestAsked,
						unavailable: t.requestUnavailable,
						suggest: t.tagSuggestFailed,
					}[error] ?? t.requestFailed}
				</Callout>
			) : null}
			{waitlisted ? <Callout>{t.waitlistJoined}</Callout> : null}
			{tagged ? <Callout>{t.tagsSaved}</Callout> : null}
			{suggested ? <Callout>{t.tagSuggested}</Callout> : null}

			<h2>
				{t.copiesNearby}{" "}
				<span className="muted">
					{t.copiesSummary(
						copies.length,
						copies.filter((copy) => copy.available).length,
					)}
				</span>
			</h2>
			{copies.length === 0 ? (
				<Empty
					title={t.noCopies}
					hint={waiting ? t.waitingCount(waiting) : undefined}
				/>
			) : null}
			{copies.length === 0 ? (
				<p>
					<a
						className="btn secondary"
						href={`/shelf/add?${new URLSearchParams({
							...(edition?.isbn13 ? { isbn: edition.isbn13 } : {}),
							title: work.title,
							authors: work.authors.join(", "),
						}).toString()}`}
					>
						{t.haveIt}
					</a>
				</p>
			) : null}

			{/* The chooser: scan who has it, open the one you want, ask. */}
			<ol className="choose">
				{copies.map((copy) => {
					const distance =
						copy.owner.area.distanceM !== null
							? formatDistance(locale, copy.owner.area.distanceM)
							: null;
					const where = [
						me.community.compact ? null : copy.owner.area.label,
						distance,
					]
						.filter(Boolean)
						.join(" · ");
					const askable =
						!copy.mine &&
						!copy.myLoanId &&
						!copy.heldUntil &&
						(copy.available || copy.relayable);
					const heading = (
						<>
							<bdi className="choose-who">
								{copy.mine ? t.you : copy.owner.displayName}
							</bdi>
							<span className="muted">
								<bdi>{where}</bdi>
							</span>
							{/* Yours on loan, or asked for: said as yours, not as "lent". */}
							{copy.myLoanStatus ? (
								<span className="badge badge-ok">
									{t.myLoanBadge(copy.myLoanStatus)}
								</span>
							) : (
								<span
									className={`badge badge-${copy.available ? "ok" : "off"}`}
								>
									{t.availability(copy)}
								</span>
							)}
						</>
					);
					// Small community: knowing whose copy it is matters, and so
					// does what else they have.
					const theirShelf = (
						<p className="muted">
							<a
								href={
									copy.mine
										? "/shelf"
										: `/?owner=${encodeURIComponent(copy.owner.id)}`
								}
							>
								{copy.mine ? t.shelf : t.otherBooksFrom(copy.owner.displayName)}
							</a>
						</p>
					);
					const detail = (
						<>
							<ThingFacts
								quantity={copy.quantity}
								details={copy.details}
								t={t}
							/>
							<p className="muted">
								{t.condition}: {t.conditionName(copy.condition)}
								{copy.note ? (
									<>
										{" · "}
										<bdi>{copy.note}</bdi>
									</>
								) : null}
							</p>
						</>
					);

					if (!askable) {
						return (
							<li className="choose-row" key={copy.id}>
								<div className="choose-head">{heading}</div>
								{detail}
								{theirShelf}
								{copy.mine ? (
									<p className="muted">
										<a href={`/shelf/${copy.id}`}>{t.manageCopy}</a>
									</p>
								) : copy.myLoanId ? (
									<p>
										{copy.myLoanStatus === "active"
											? t.withYou(
													copy.myLoanDue
														? date.format(copy.myLoanDue * 1000)
														: null,
												)
											: copy.myLoanStatus === "accepted"
												? t.youAgreed
												: t.youRequested}{" "}
										<a className="btn quiet" href={`/loans/${copy.myLoanId}`}>
											{t.yourLoan}
										</a>
									</p>
								) : copy.heldUntil ? (
									<p className="muted">
										{t.heldFor(dateTime.format(copy.heldUntil * 1000))}
									</p>
								) : (
									<p className="muted">{t.stateName(copy.state)}</p>
								)}
							</li>
						);
					}

					return (
						<li className="choose-row" key={copy.id}>
							{/* Open, every one: the button to ask is never a tap away. */}
							<div className="choose-head">{heading}</div>
							{detail}
							{theirShelf}
							{copy.heldForMe ? (
								<p className="muted">
									{t.offerHeld(dateTime.format(copy.heldForMe * 1000))}
								</p>
							) : null}
							<form action="/api/loans" method="post" className="request">
								<input type="hidden" name="copyId" value={copy.id} />
								<input type="hidden" name="workId" value={work.id} />
								{/* A set: borrow as many as are needed, of those free. */}
								{copy.quantity > 1 && copy.free ? (
									<>
										<label htmlFor={`quantity-${copy.id}`}>
											{t.howManyAsk(copy.free)}
										</label>
										<input
											id={`quantity-${copy.id}`}
											name="quantity"
											type="number"
											min={1}
											max={copy.free}
											defaultValue={1}
											dir="ltr"
											required
										/>
									</>
								) : null}
								<button type="submit">
									{copy.relayable ? t.requestRelay : t.borrow}
								</button>
								<input
									name="message"
									type="text"
									dir="auto"
									maxLength={280}
									placeholder={t.requestNote}
									aria-label={t.requestNote}
								/>
							</form>
						</li>
					);
				})}
			</ol>
			<section className="waitlist">
				{myWaitlist ? (
					<div className="callout">
						<p>{t.waitlistPosition(myWaitlist.position)}</p>
						<form
							action={`/api/waitlist/${myWaitlist.id}`}
							method="post"
							className="inline"
						>
							<input type="hidden" name="back" value={`/works/${work.id}`} />
							<button type="submit" className="link">
								{t.waitlistLeave}
							</button>
						</form>
					</div>
				) : anyRequestable || ownCopy || myLoan ? null : (
					<form action="/api/waitlist" method="post">
						<input type="hidden" name="workId" value={work.id} />
						<p className="muted">{t.waitlistHint}</p>
						<button type="submit" className="secondary">
							{t.waitlistJoin}
						</button>
					</form>
				)}
			</section>

			{/* Everyone close by: where each copy is tells nobody anything. */}
			{!me.community.compact &&
			copies.some((copy) => !copy.mine && copy.owner.area.approx) ? (
				<AreaMap
					centre={me.community.centre}
					you={me.area ? { lat: me.area.lat, lng: me.area.lng } : null}
					points={copies
						.filter((copy) => !copy.mine && copy.owner.area.approx)
						.map((copy) => ({
							lat: copy.owner.area.approx!.lat,
							lng: copy.owner.area.approx!.lng,
							label: `${copy.owner.displayName} · ${copy.owner.area.label}`,
						}))}
					labels={{
						you: t.you,
						locate: t.locate,
						located: t.located,
						locateFailed: t.locateFailed,
					}}
				/>
			) : null}

			{/* The reader's own marks on the book; nobody else sees them. After
			    the asking and the map: the page is for asking. They save in
			    the background, so a tap does not send the reader to the top. */}
			<AsyncForms
				labels={{
					saving: t.formSaving,
					saved: t.formSaved,
					failed: t.requestFailed,
				}}
			/>
			<div className="book-marks">
				<form action="/api/me/wishlist" method="post" data-async="">
					<input type="hidden" name="workId" value={work.id} />
					<input type="hidden" name="wished" value={wished ? "0" : "1"} />
					<button type="submit" className="toggle" aria-pressed={wished}>
						<BookmarkSimple
							size={16}
							weight={wished ? "fill" : "bold"}
							aria-hidden="true"
						/>
						{t.wishlist}
					</button>
				</form>
				{kind.readMarks ? (
					<form action="/api/me/read" method="post" data-async="">
						<input type="hidden" name="workId" value={work.id} />
						<input type="hidden" name="read" value={read ? "0" : "1"} />
						<button type="submit" className="toggle" aria-pressed={read}>
							<Check size={16} weight="bold" aria-hidden="true" />
							{t.markRead}
						</button>
					</form>
				) : null}
			</div>

			{/* Housekeeping, after the reason anyone came to this page: only
			    for an owner or a moderator. */}
			{copies.some((copy) => copy.mine) || isModerator ? (
				<section className="book-extras">
					{/* An owner tags their own book; a moderator may tag any. */}
					{copies.some((copy) => copy.mine) || isModerator ? (
						<details className="tag-edit">
							<summary className="muted">{t.editTags}</summary>
							<form action={`/api/works/${work.id}/tags`} method="post">
								<input type="hidden" name="back" value={`/works/${work.id}`} />
								<TagPicker
									vocab={vocab}
									locale={locale}
									selected={work.tags}
									legend={t.tagsLegend}
								/>
								<button type="submit" className="secondary">
									{t.save}
								</button>
							</form>
						</details>
					) : null}

					{copies.some((copy) => copy.mine) ? (
						<SuggestTag
							vocab={vocab}
							locale={locale}
							workId={work.id}
							back={`/works/${work.id}`}
							labels={{
								summary: t.suggestTag,
								hint: t.suggestTagHint,
								label: t.suggestTagLabel,
								value: t.suggestTagValue,
								newLabel: t.suggestNewLabel,
								newLabelName: t.suggestNewLabelName,
								send: t.suggestSend,
							}}
						/>
					) : null}

					{isModerator ? (
						<details className="tag-edit">
							<summary className="muted">{t.editBook}</summary>
							<form
								action={`/api/works/${work.id}/details`}
								method="post"
								encType="multipart/form-data"
							>
								<input type="hidden" name="back" value={`/works/${work.id}`} />
								<label htmlFor="work-title">{t.title}</label>
								<input
									id="work-title"
									name="title"
									maxLength={200}
									type="text"
									dir="auto"
									required
									defaultValue={work.title}
								/>
								{kind.authors ? (
									<>
										<label htmlFor="work-authors">{t.authors}</label>
										<input
											id="work-authors"
											name="authors"
											type="text"
											dir="auto"
											defaultValue={work.authors.join(", ")}
										/>
									</>
								) : null}
								<label htmlFor="work-note">{t.workNote}</label>
								<textarea
									id="work-note"
									name="note"
									dir="auto"
									rows={3}
									maxLength={500}
									placeholder={t.workNoteHint}
									defaultValue={work.note ?? noteFromCopy ?? ""}
									aria-describedby={noteFromCopy ? "work-note-from" : undefined}
								/>
								{noteFromCopy ? (
									<p className="muted" id="work-note-from">
										{t.workNoteFromCopy}
									</p>
								) : null}
								{/* The cover belongs to the edition, so it is only
							    replaceable while there is one to belong to. */}
								{editions.length === 1 ? (
									<>
										<label htmlFor="work-cover">{t.replaceCover}</label>
										<input
											id="work-cover"
											name="cover"
											type="file"
											accept="image/jpeg,image/png,image/webp"
										/>
									</>
								) : (
									<p className="muted">{t.editEditionsFirst}</p>
								)}
								<p className="muted">{t.editBookHint}</p>
								<button type="submit" className="secondary">
									{t.save}
								</button>
							</form>
						</details>
					) : null}
				</section>
			) : null}
		</main>
	);
}
