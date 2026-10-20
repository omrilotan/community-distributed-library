import { cookies } from "next/headers";
import type { BrowseResponse } from "@cdl/contracts";
import { core } from "../lib/core.ts";
import { strings, type Locale } from "../lib/i18n.ts";
import { sessionToken } from "../lib/session.ts";
import { WorkCard } from "./copy-card.tsx";
import { PageHead } from "./ui.tsx";

/**
 * Nothing here. A library is a good place to be lost in, so rather than an
 * apology and a dead end, hand over a book somebody nearby is lending.
 */
export default async function NotFound() {
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const signedIn = Boolean(await sessionToken());

	// One book, picked from what can be borrowed today. A visitor gets none.
	const listing = signedIn
		? await core<BrowseResponse>("/v1/browse?limit=60&availableOnly=1").catch(
				() => null,
			)
		: null;
	const shelf = listing?.status === 200 ? listing.body.results : [];
	const pick = shelf.length
		? shelf[Math.floor(Math.random() * shelf.length)]!
		: null;

	return (
		<main className="narrow" style={{ maxInlineSize: "32rem" }}>
			<PageHead title={t.notFound} />
			<p className="muted">{t.notFoundHint}</p>
			<p>
				<a className="btn" href="/">
					{t.browse}
				</a>
			</p>

			{pick ? (
				<section>
					<h2>{t.notFoundInstead}</h2>
					<div className="grid">
						<WorkCard listing={pick} locale={locale} t={t} />
					</div>
				</section>
			) : null}

			<p className="muted">
				<a href="/about">{t.about}</a>
				{signedIn ? (
					<>
						{" · "}
						<a href="/shelf">{t.shelf}</a>
						{" · "}
						<a href="/loans">{t.loans}</a>
					</>
				) : (
					<>
						{" · "}
						<a href="/login">{t.signIn}</a>
					</>
				)}
			</p>
		</main>
	);
}
