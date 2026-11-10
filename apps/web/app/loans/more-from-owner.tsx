import type { CopyListing, MoreFromOwner } from "@cdl/contracts";
import type { Strings } from "../../lib/i18n.ts";
import { PlainCover } from "../plain-cover.tsx";

/**
 * On the way to meeting an owner: a few more of theirs, the borrower's own
 * wishes first. One tap asks for one; if the owner says yes it joins the
 * same handoff. "Not now" puts this owner's away for a while.
 */
export function MoreFromOwnerSection({
	more,
	loanId,
	back,
	t,
}: {
	more: MoreFromOwner;
	loanId: string;
	back: string;
	t: Strings;
}) {
	return (
		<section className="more-from" aria-labelledby="more-from-title">
			<h2 id="more-from-title">{t.moreFrom(more.owner.displayName)}</h2>
			<p className="muted">{t.moreHint}</p>
			{more.wished.length ? (
				<>
					<h3>{t.wishlist}</h3>
					<ul className="more-list">
						{more.wished.map((copy) => (
							<MoreItem key={copy.id} copy={copy} back={back} t={t} />
						))}
					</ul>
				</>
			) : null}
			{more.more.length ? (
				<ul className="more-list">
					{more.more.map((copy) => (
						<MoreItem key={copy.id} copy={copy} back={back} t={t} />
					))}
				</ul>
			) : null}
			<div className="more-foot">
				<a href={`/?owner=${encodeURIComponent(more.owner.id)}`}>
					{t.moreAll(more.owner.displayName)}
				</a>
				<form
					action={`/api/loans/${loanId}/more`}
					method="post"
					className="inline"
				>
					<input type="hidden" name="owner" value={more.owner.id} />
					<button type="submit" className="link">
						{t.moreNotNow}
					</button>
				</form>
			</div>
		</section>
	);
}

function MoreItem({
	copy,
	back,
	t,
}: {
	copy: CopyListing;
	back: string;
	t: Strings;
}) {
	const cover = copy.edition.coverUrl ?? copy.photos[0] ?? null;
	return (
		<li className="more-item">
			<a href={`/works/${copy.work.id}`} aria-hidden="true" tabIndex={-1}>
				{cover ? (
					<img alt="" src={cover} />
				) : (
					<span className="thumb">
						<PlainCover title={copy.edition.title} size="thumb" />
					</span>
				)}
			</a>
			<div>
				<a className="loan-item-title" href={`/works/${copy.work.id}`}>
					<bdi>{copy.edition.title}</bdi>
				</a>
				{copy.work.authors.length ? (
					<div className="muted">
						<bdi>{copy.work.authors.join(", ")}</bdi>
					</div>
				) : null}
				<form action="/api/loans" method="post">
					<input type="hidden" name="copyId" value={copy.id} />
					<input type="hidden" name="workId" value={copy.work.id} />
					<input type="hidden" name="back" value={back} />
					<button type="submit" className="quiet">
						{t.moreAsk}
					</button>
				</form>
			</div>
		</li>
	);
}
