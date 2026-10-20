import { cookies } from "next/headers";
import type { WishlistResponse } from "@cdl/contracts";
import { core } from "../../lib/core.ts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { signedOut } from "../../lib/session.ts";
import { requireProfile } from "../../lib/profile.ts";
import { Empty, PageHead } from "../ui.tsx";
import { WorkCard } from "../copy-card.tsx";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.wishlist);

/**
 * The books a member wants to read, kept from their pages. The ones on a
 * shelf here look as they do when browsing; the rest wait for a copy.
 */
export default async function WishlistPage() {
	await requireProfile();
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const { status, body } = await core<WishlistResponse>("/v1/me/wishlist");
	if (status === 401) signedOut(status);
	const results = status === 200 ? body.results : [];
	const withoutCopies = status === 200 ? body.withoutCopies : [];

	return (
		<main>
			<PageHead title={t.wishlist} />
			{results.length || withoutCopies.length ? (
				<p className="muted">{t.wishlistHint}</p>
			) : (
				<Empty
					title={t.wishlistEmpty}
					hint={t.wishlistEmptyHint}
					action={{ href: "/", label: t.emptyBrowse }}
				/>
			)}
			{results.length ? (
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
			) : null}
			{withoutCopies.length ? (
				<section>
					<h2>{t.wishlistWithoutCopies}</h2>
					<ul className="hooks">
						{withoutCopies.map((work) => (
							<li key={work.id}>
								<div>
									<a href={`/works/${work.id}`}>
										<bdi>
											<strong>{work.title}</strong>
										</bdi>
									</a>
									<div className="muted">
										<bdi>{work.authors.join(", ")}</bdi>
									</div>
								</div>
							</li>
						))}
					</ul>
				</section>
			) : null}
		</main>
	);
}
