import { cookies } from "next/headers";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { CoverPicker } from "./cover-picker.tsx";
import { IsbnField } from "./isbn-field.tsx";
import type { WorkCard } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { requireSession } from "../../../lib/session.ts";
import { Callout } from "../../ui.tsx";
import { TagPicker } from "../../tags.tsx";
import { vocabulary } from "../../../lib/vocabulary.ts";
import { library } from "../../../lib/library.ts";
import { ThingForm } from "./thing-form.tsx";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.addCopy);

export default async function AddCopyPage({
	searchParams,
}: {
	searchParams: Promise<{
		added?: string;
		n?: string;
		error?: string;
		isbn?: string;
		title?: string;
		authors?: string;
		mine?: string;
		dupe?: string;
		merged?: string;
		kept?: string;
		first?: string;
	}>;
}) {
	await requireSession();
	const {
		added,
		n,
		error,
		isbn,
		title,
		authors,
		mine,
		dupe,
		merged,
		kept,
		first,
	} = await searchParams;
	const count = Number(n ?? 0) || 0;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const vocab = await vocabulary();
	// A library of things adds things: a name, how many, the owner's details.
	const things = (await library()).type === "things";
	// The book somebody else listed that this one might be a second copy of.
	const twin =
		mine && dupe
			? (await core<WorkCard>(`/v1/works/${encodeURIComponent(dupe)}/card`))
					.body
			: null;

	return (
		<main className="narrow">
			<h1>{things ? t.addThing : first ? t.setupBookTitle : t.addCopy}</h1>
			{added ? (
				<Callout>
					{t.addedCopy(added)}
					{count > 1 ? ` · ${t.addedCount(count)}` : ""}{" "}
					<a href="/shelf">{t.shelf}</a>
				</Callout>
			) : null}
			{first ? (
				<Callout>
					{t.firstBook}{" "}
					{/* A pile of books goes faster through an assistant. */}
					{t.startAssistantShort} <a href="/connect">{t.connect}</a>
				</Callout>
			) : null}
			{merged ? <Callout>{t.booksMerged}</Callout> : null}
			{kept ? <Callout>{t.booksKeptApart}</Callout> : null}
			{twin && mine && dupe ? (
				<div className="callout twin">
					<p>{t.sameBookAsk}</p>
					<div className="pair">
						{twin.coverUrl ? (
							<img alt="" src={twin.coverUrl} className="twin-cover" />
						) : null}
						<div>
							<bdi>
								<strong>{twin.title}</strong>
							</bdi>
							<div className="muted">
								<bdi>{twin.authors.join(", ")}</bdi>
							</div>
						</div>
					</div>
					<div className="actions">
						<form
							action={`/api/works/${mine}/merge`}
							method="post"
							className="inline"
						>
							<input type="hidden" name="into" value={dupe} />
							<input type="hidden" name="back" value="/shelf/add" />
							<button type="submit" className="secondary">
								{t.sameBookYes}
							</button>
						</form>
						<form
							action={`/api/works/${mine}/distinct`}
							method="post"
							className="inline"
						>
							<input type="hidden" name="from" value={dupe} />
							<input type="hidden" name="back" value="/shelf/add" />
							<button type="submit" className="link">
								{t.sameBookNo}
							</button>
						</form>
					</div>
				</div>
			) : null}
			{error === "cover" ? (
				<Callout tone="warn">{t.coverFailed}</Callout>
			) : null}
			{error === "1" ? <Callout tone="warn">{t.addFailed}</Callout> : null}
			{error === "merge" ? (
				<Callout tone="warn">{t.mergeFailed}</Callout>
			) : null}
			{things ? (
				<ThingForm t={t} vocab={vocab} locale={locale} count={count} />
			) : (
				<BookForm />
			)}
		</main>
	);

	function BookForm() {
		return (
			<>
				<p className="muted">{t.scanHint}</p>

				{/* Plain form post: it works without JavaScript. */}
				<form action="/api/copies" method="post" encType="multipart/form-data">
					<input type="hidden" name="n" value={count} />
					<p className="form-key">{t.requiredKey}</p>
					<label htmlFor="title">{t.title}</label>
					<input
						id="title"
						name="title"
						maxLength={200}
						type="text"
						dir="auto"
						required
						defaultValue={title ?? ""}
						placeholder={t.titlePlaceholder}
					/>

					<label htmlFor="authors">{t.authors}</label>
					<input
						id="authors"
						name="authors"
						type="text"
						dir="auto"
						required
						defaultValue={authors ?? ""}
						placeholder={t.authorsPlaceholder}
					/>

					<label htmlFor="condition">{t.condition}</label>
					<select id="condition" name="condition" defaultValue="good">
						{(["new", "good", "worn", "fragile"] as const).map((value) => (
							<option key={value} value={value}>
								{t.conditionName(value)}
							</option>
						))}
					</select>

					<p className="picker-label">{t.cover}</p>
					<CoverPicker
						labels={{
							choose: t.coverChoose,
							change: t.coverChange,
							remove: t.coverRemove,
							zoom: t.coverZoom,
							hint: t.coverHint,
						}}
					/>

					<TagPicker vocab={vocab} locale={locale} legend={t.tagsLegend} />

					<label htmlFor="note">{t.note}</label>
					<input
						id="note"
						name="note"
						type="text"
						dir="auto"
						maxLength={280}
						placeholder={t.notePlaceholder}
					/>

					<label className="check">
						<input
							name="relayAllowed"
							type="checkbox"
							value="on"
							defaultChecked
						/>
						{t.relay}
					</label>

					{/* Last: most books here have no ISBN the providers know. */}
					<IsbnField
						initial={isbn ?? ""}
						labels={{
							isbn: t.isbn,
							lookingUp: t.lookingUp,
							notFound: t.isbnNotFound,
							notIsbn: t.notIsbn,
							found: t.isbnFound,
							placeholder: t.isbnPlaceholder,
						}}
					/>

					<button type="submit" className="wide-on-phone">
						{t.save}
					</button>
				</form>
			</>
		);
	}
}
