import { cookies } from "next/headers";
import { core } from "../../lib/core.ts";
import { strings, type Locale } from "../../lib/i18n.ts";
import { signedOut } from "../../lib/session.ts";
import { requireProfile } from "../../lib/profile.ts";
import { Callout, Empty, PageHead } from "../ui.tsx";
import { PlainCover } from "../plain-cover.tsx";
import { dateFormat } from "../../lib/dates.ts";
import { titled } from "../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.shelf);

interface ShelfResponse {
	copies: {
		id: string;
		title: string;
		authors: string[];
		coverUrl: string | null;
		state: string;
		lending: string;
		relayAllowed: boolean;
		note: string | null;
	}[];
}

export default async function ShelfPage({
	searchParams,
}: {
	searchParams: Promise<{ removed?: string; added?: string }>;
}) {
	const { removed, added } = await searchParams;
	const me = await requireProfile();
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const { status, body } = await core<ShelfResponse>("/v1/me/shelf");
	if (status === 401) signedOut(status);
	const copies = status === 200 ? body.copies : [];

	return (
		<main>
			<PageHead
				title={t.shelf}
				aside={
					<a className="btn" href="/shelf/add">
						{t.addCopy}
					</a>
				}
			/>

			{removed ? <Callout>{t.removed}</Callout> : null}
			{added ? <Callout>{t.addedCopy(added)}</Callout> : null}
			{/* Away, so none of this can be asked for; say so where the books are. */}
			{me.awayUntil ? (
				<Callout tone="warn">
					{t.awayShelf(
						dateFormat(locale, { dateStyle: "medium" }).format(
							me.awayUntil * 1000,
						),
					)}{" "}
					<a href="/settings">{t.profile}</a>
				</Callout>
			) : null}
			{copies.length === 0 ? (
				<Empty title={t.emptyShelf} hint={t.emptyShelfHint} />
			) : null}
			{copies.length ? (
				<p className="muted">
					<a href="/shelf/tagging">{t.myTaggingLink}</a>
				</p>
			) : null}

			{copies.map((copy) => (
				<a className="card card-link" href={`/shelf/${copy.id}`} key={copy.id}>
					{/* A cover is fetched only as it nears the screen: a shelf can be
					    long, and the browser knows where the fold is better than we do. */}
					{copy.coverUrl ? (
						<img alt="" src={copy.coverUrl} loading="lazy" decoding="async" />
					) : (
						<span className="thumb">
							<PlainCover title={copy.title} size="thumb" />
						</span>
					)}
					<div>
						<bdi>
							<strong>{copy.title}</strong>
						</bdi>
						<div className="muted">
							<bdi>{copy.authors.join(", ")}</bdi>
						</div>
						<div className="actions">
							<span
								className={`badge${copy.state === "shelved" && copy.lending === "lendable" ? " badge-ok" : ""}`}
							>
								{t.availability(copy)}
							</span>
							<span className="muted">{t.manage}</span>
						</div>
					</div>
				</a>
			))}
		</main>
	);
}
