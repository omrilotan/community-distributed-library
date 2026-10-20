import { cookies } from "next/headers";
import type { CopyDetail } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { signedOut } from "../../../lib/session.ts";
import { requireProfile } from "../../../lib/profile.ts";
import { CoverPicker } from "../add/cover-picker.tsx";
import { PhotosPicker } from "../add/photos-picker.tsx";
import { Callout, Empty } from "../../ui.tsx";
import { TagPicker } from "../../tags.tsx";
import { Stats } from "../../stats.tsx";
import { vocabulary } from "../../../lib/vocabulary.ts";
import { PlainCover } from "../../plain-cover.tsx";
import { library } from "../../../lib/library.ts";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.shelf);

/** Manage one of my copies: edit what can change, or take it off the shelf. */
export default async function ManageCopyPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ saved?: string; error?: string }>;
}) {
	await requireProfile();
	const { id } = await params;
	const { saved, error } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const vocab = await vocabulary();
	const when = dateFormat(locale, { dateStyle: "medium" });

	const detail = await core<CopyDetail>(`/v1/copies/${encodeURIComponent(id)}`);
	if (detail.status === 401) signedOut(detail.status);
	if (detail.status !== 200) {
		return <Empty title={t.noSuchBook} />;
	}
	const copy = detail.body;
	const locked = Boolean(copy.openLoan);
	// A thing is named, counted and described by its owner; a book has a title and authors.
	const things = (await library()).type === "things";
	const detailField = (
		name: "brand" | "model" | "included" | "needs" | "care",
		label: string,
		max: number,
	) => (
		<>
			<label htmlFor={name}>{label}</label>
			<input
				id={name}
				name={name}
				type="text"
				dir="auto"
				maxLength={max}
				defaultValue={copy.details?.[name] ?? ""}
			/>
		</>
	);

	return (
		<main className="book">
			{/* Cover beside what names the copy; the form below is full width. A
			    thing has none here: its photos open the form, right below. */}
			<header className={things ? "book-head no-cover" : "book-head"}>
				{things ? null : (
					<div className="book-cover">
						{copy.edition.coverUrl ? (
							<img alt="" src={copy.edition.coverUrl} />
						) : (
							<PlainCover title={copy.edition.title} size="book" />
						)}
					</div>
				)}
				<div>
					<h1>
						<bdi>{copy.edition.title}</bdi>
					</h1>
					<p className="muted">
						<span
							className={`badge badge-${copy.state === "shelved" && copy.lending === "lendable" ? "ok" : "off"}`}
						>
							{t.availability(copy)}
						</span>
						{copy.openLoan ? ` · ${t.loanStatus(copy.openLoan.status)}` : ""}
						{" · "}
						<a href={`/works/${copy.work.id}`}>{t.viewBookPage}</a>
					</p>
				</div>
			</header>

			<div>
				{saved ? <Callout>{t.saved}</Callout> : null}
				{error === "locked" ? (
					<Callout tone="warn">{t.copyLocked}</Callout>
				) : null}
				{error === "shared" ? (
					<Callout tone="warn">{t.editionShared}</Callout>
				) : null}
				{error === "cover" ? (
					<Callout tone="warn">{t.coverFailed}</Callout>
				) : null}
				{error && !["locked", "shared", "cover"].includes(error) ? (
					<Callout tone="warn">{t.adminActionFailed}</Callout>
				) : null}

				<form
					action={`/api/copies/${copy.id}`}
					method="post"
					encType="multipart/form-data"
				>
					{things || copy.editable.details ? (
						<p className="form-key">{t.requiredKey}</p>
					) : null}
					{/* A thing's photos come first, under its picture: keep or drop those
					    it has, add up to four. */}
					{things ? (
						<fieldset className="photos-kept">
							<legend className="picker-label">{t.photos}</legend>
							<PhotosPicker
								max={4}
								// A picture set without photos (by a moderator, before
								// photos were kept) is still its picture: kept, not lost.
								kept={
									copy.photos.length
										? copy.photos
										: copy.edition.coverUrl
											? [copy.edition.coverUrl]
											: []
								}
								labels={{
									add: t.photosAdd,
									remove: t.photosRemove,
									zoom: t.coverZoom,
									hint: t.photosHint,
									main: t.photosMain,
									keep: t.photosKeep,
									earlier: t.photosEarlier,
									later: t.photosLater,
									room: {
										none: t.photosRoomNone,
										one: t.photosRoomOne,
										many: t.photosRoomMany,
									},
								}}
							/>
						</fieldset>
					) : null}
					{things ? (
						<>
							<input type="hidden" name="kind" value="thing" />
							<label htmlFor="title">{t.thingName}</label>
							<input
								id="title"
								name="title"
								maxLength={120}
								type="text"
								dir="auto"
								required
								defaultValue={copy.edition.title}
							/>
							<label htmlFor="quantity">{t.quantity}</label>
							<input
								id="quantity"
								name="quantity"
								type="number"
								min={1}
								max={500}
								dir="ltr"
								defaultValue={copy.quantity}
								disabled={locked}
							/>
							<fieldset className="thing-details">
								<legend className="muted">{t.thingDetails}</legend>
								{detailField("brand", t.brand, 80)}
								{detailField("model", t.model, 80)}
								{detailField("included", t.included, 300)}
								{detailField("needs", t.needs, 300)}
								{detailField("care", t.care, 300)}
								<label htmlFor="link">{t.productLink}</label>
								<input
									id="link"
									name="link"
									type="url"
									dir="ltr"
									maxLength={500}
									inputMode="url"
									defaultValue={copy.details?.link ?? ""}
									placeholder={t.productLinkPlaceholder}
								/>
							</fieldset>
						</>
					) : copy.editable.details ? (
						<>
							<label htmlFor="title">{t.title}</label>
							<input
								id="title"
								name="title"
								maxLength={200}
								type="text"
								dir="auto"
								required
								defaultValue={copy.edition.title}
							/>
							<label htmlFor="authors">{t.authors}</label>
							<input
								id="authors"
								name="authors"
								type="text"
								dir="auto"
								required
								defaultValue={copy.work.authors.join(", ")}
							/>
						</>
					) : (
						<p className="muted">{t.editionSharedHint}</p>
					)}

					<label htmlFor="condition">{t.condition}</label>
					<select id="condition" name="condition" defaultValue={copy.condition}>
						{(["new", "good", "worn", "fragile"] as const).map((value) => (
							<option key={value} value={value}>
								{t.conditionName(value)}
							</option>
						))}
					</select>

					<label htmlFor="lending">{t.lendingPolicy}</label>
					<select
						id="lending"
						name="lending"
						defaultValue={copy.lending}
						disabled={locked}
					>
						<option value="lendable">{t.lendingLendable}</option>
						<option value="paused">{t.lendingPaused}</option>
						<option value="reference">{t.lendingReference}</option>
					</select>
					{locked ? <p className="muted">{t.copyLockedHint}</p> : null}

					<label htmlFor="loanDays">{t.loanDays}</label>
					<input
						id="loanDays"
						name="loanDays"
						type="number"
						min={1}
						max={90}
						defaultValue={copy.loanDays ?? ""}
						placeholder={t.loanDaysDefault}
					/>

					<input type="hidden" name="workId" value={copy.work.id} />
					<TagPicker
						vocab={vocab}
						locale={locale}
						selected={copy.work.tags}
						legend={things ? t.categoryLegend : t.tagsLegend}
					/>

					<label htmlFor="note">{t.note}</label>
					<input
						id="note"
						name="note"
						type="text"
						dir="auto"
						maxLength={280}
						defaultValue={copy.note ?? ""}
					/>

					{/* A set always comes back to its owner. */}
					{copy.quantity > 1 ? null : (
						<label className="check">
							<input
								name="relayAllowed"
								type="checkbox"
								value="on"
								defaultChecked={copy.relayAllowed}
							/>
							{t.relay}
						</label>
					)}

					{/* A shared edition's cover belongs to every owner: it can be given
					    one, but not swapped by one of them. */}
					{!things && (copy.editable.details || !copy.edition.coverUrl) ? (
						<>
							<p className="picker-label">
								{things ? t.photo : t.replaceCover}
							</p>
							<CoverPicker
								labels={{
									choose: t.coverChoose,
									change: t.coverChange,
									remove: t.coverRemove,
									zoom: t.coverZoom,
									hint: things ? t.photoHint : t.coverHint,
								}}
							/>
						</>
					) : null}

					<button type="submit">{t.save}</button>
				</form>

				<h2>{t.removeHeading}</h2>
				{locked ? (
					<p className="muted">{t.copyLockedHint}</p>
				) : (
					// The question opens where the tap was, with no reload to send
					// the page back to the top. Tapping the line again closes it.
					<details className="confirm">
						<summary>{t.removeFromShelf}</summary>
						<form
							action={`/api/copies/${copy.id}/delete`}
							method="post"
							className="callout"
						>
							<p>{t.removeConfirm}</p>
							<button type="submit" className="danger">
								{t.removeYes}
							</button>
						</form>
					</details>
				)}
			</div>
			<section>
				<h2>{t.statsTitle}</h2>
				<Stats
					items={[
						[t.statAdded, when.format(copy.stats.addedAt * 1000)],
						[t.statLoans, String(copy.stats.loans)],
						[t.statReaders, String(copy.stats.readers)],
						[t.statDaysOut, String(copy.stats.daysOut)],
						[
							t.statLastLoan,
							copy.stats.lastLoanAt
								? when.format(copy.stats.lastLoanAt * 1000)
								: t.statNever,
						],
					]}
				/>
				<p className="muted">{t.statsPrivate}</p>
			</section>
		</main>
	);
}
