import { cookies } from "next/headers";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled(
	(t) => `${t.possibleDuplicates} · ${t.admin}`,
);

interface Side {
	id: string;
	title: string;
	authors: string[];
	coverUrl: string | null;
	owners: string[];
	score: number;
}

/**
 * Books that look like one book. Merging keeps whichever title the moderator
 * picks; the other record and everything pointing at it moves across.
 */
export default async function AdminDuplicates({
	searchParams,
}: {
	searchParams: Promise<{ merged?: string; kept?: string; error?: string }>;
}) {
	const me = await moderatorOrNull();
	const { merged, kept, error } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const found = await core<{ pairs: { left: Side; right: Side }[] }>(
		"/v1/admin/duplicates",
	);
	const pairs = found.status === 200 ? found.body.pairs : [];

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="duplicates" admin={me.role === "admin"} />
			{merged ? <Callout>{t.booksMerged}</Callout> : null}
			{kept ? <Callout>{t.booksKeptApart}</Callout> : null}
			{error ? <Callout tone="warn">{t.adminActionFailed}</Callout> : null}

			<h2>{t.possibleDuplicates}</h2>
			<p className="muted">{t.duplicatesHint}</p>
			{pairs.length === 0 ? <Empty title={t.noDuplicates} /> : null}

			{pairs.map(({ left, right }) => (
				<article className="card" key={`${left.id}:${right.id}`}>
					<div>
						<div className="pair">
							{[left, right].map((side) => (
								<div key={side.id}>
									<a href={`/works/${side.id}`}>
										<bdi>
											<strong>{side.title}</strong>
										</bdi>
									</a>
									<div className="muted">
										<bdi>{side.authors.join(", ")}</bdi>
										{side.owners.length ? (
											<>
												{" · "}
												<bdi>{side.owners.join(", ")}</bdi>
											</>
										) : null}
									</div>
								</div>
							))}
						</div>
						<div className="actions">
							{/* Merging into X keeps X's title. */}
							<form
								action={`/api/works/${right.id}/merge`}
								method="post"
								className="inline"
							>
								<input type="hidden" name="into" value={left.id} />
								<input type="hidden" name="back" value="/admin/duplicates" />
								<button type="submit" className="quiet">
									{t.mergeKeeping(left.title)}
								</button>
							</form>
							<form
								action={`/api/works/${left.id}/merge`}
								method="post"
								className="inline"
							>
								<input type="hidden" name="into" value={right.id} />
								<input type="hidden" name="back" value="/admin/duplicates" />
								<button type="submit" className="quiet">
									{t.mergeKeeping(right.title)}
								</button>
							</form>
							<form
								action={`/api/works/${left.id}/distinct`}
								method="post"
								className="inline"
							>
								<input type="hidden" name="from" value={right.id} />
								<input type="hidden" name="back" value="/admin/duplicates" />
								<button type="submit" className="link">
									{t.differentBooks}
								</button>
							</form>
						</div>
					</div>
				</article>
			))}
		</main>
	);
}
