import type { WorkListing } from "@cdl/contracts";
import { formatDistance, type Locale, type Strings } from "../lib/i18n.ts";
import { coverTransition } from "../lib/cover-transition.ts";
import { PlainCover } from "./plain-cover.tsx";

/**
 * One tile per book, not per copy. In a community this small the useful facts
 * are who has it and how far away they are — you ask the neighbour you know,
 * or the one on your street — so the names are on the tile.
 */
export function WorkCard({
	listing,
	locale,
	t,
}: {
	listing: WorkListing;
	locale: Locale;
	t: Strings;
}) {
	const { work, edition, copies, available } = listing;
	// Nothing to borrow because everyone who has it is away: say that, rather
	// than "all out", which means somebody is reading it.
	const allAway =
		available === 0 &&
		copies.length > 0 &&
		copies.every((copy) => copy.ownerAway);
	const mine = copies.filter((copy) => copy.mine).length;
	const others = copies.filter((copy) => !copy.mine);
	// Nearest first already; name the first two and count the rest.
	const named = others.slice(0, 2);
	const rest = others.length - named.length;

	return (
		<a
			className={`tile${available ? "" : " tile-muted"}`}
			href={`/works/${work.id}`}
		>
			<span className="tile-cover" style={coverTransition(work.id)}>
				{edition.coverUrl ? (
					<img alt="" src={edition.coverUrl} loading="lazy" />
				) : (
					<PlainCover title={edition.title} authors={work.authors} />
				)}
				<span className={`badge badge-${available ? "ok" : "off"}`}>
					{allAway
						? t.awayBadge
						: t.copiesBadge(copies.length, available, mine > 0)}
				</span>
			</span>
			<bdi className="tile-title">{edition.title}</bdi>
			<bdi className="muted">{work.authors.join(", ")}</bdi>
			{/* Who has it. Nothing here when they are all mine: the badge says so. */}
			<span className="muted tile-who">
				{named.length === 0
					? null
					: named.map((copy, index) => (
							<span key={copy.id}>
								{index ? " · " : ""}
								<bdi>{copy.owner.displayName}</bdi>
								{copy.owner.area.distanceM !== null ? (
									<> {formatDistance(locale, copy.owner.area.distanceM)}</>
								) : null}
							</span>
						))}
				{rest > 0 ? <span>{` · ${t.andOthers(rest)}`}</span> : null}
			</span>
		</a>
	);
}
