import { cookies } from "next/headers";
import type { AskDetail } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { signedOut } from "../../../lib/session.ts";
import { requireProfile } from "../../../lib/profile.ts";
import { titled } from "../../../lib/page-title.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AskTags, comeLine } from "../ask-parts.tsx";

export const generateMetadata = titled((t) => t.offerTitle);

/**
 * One ask, for a neighbour who may have what it names: what theirs is and
 * when the asker may come by. Three fields; no photo, no category. The asker
 * is sent to the loans page, where the offers on it are.
 */
export default async function AskPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ error?: string; offered?: string }>;
}) {
	await requireProfile();
	const { id } = await params;
	const { error, offered } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const found = await core<AskDetail>(`/v1/asks/${encodeURIComponent(id)}`);
	if (found.status === 401) signedOut(found.status);
	if (found.status !== 200) return <Empty title={t.askOver} />;
	const ask = found.body;
	const open = ask.status === "open";
	const mine = ask.myOffer?.status === "offered" ? ask.myOffer : null;
	const asker = ask.asker.displayName;

	return (
		<main className="ask-page">
			<PageHead title={ask.mine ? t.askYours : t.offerTitle} />
			{offered && mine ? <Callout>{t.offerSent(asker)}</Callout> : null}
			{error ? (
				<Callout tone="warn">
					{error === "place" ? t.offerNeedsPlace : t.offerFailed}
				</Callout>
			) : null}

			<section className="ask-card">
				<AskTags ask={ask} t={t} />
				<h2>
					<bdi>{ask.what}</bdi>
				</h2>
				<p className="muted">
					<bdi>{asker}</bdi>
				</p>
				{ask.note ? (
					<p>
						<bdi>{ask.note}</bdi>
					</p>
				) : null}
			</section>

			{!open ? (
				<Callout>{t.askOver}</Callout>
			) : ask.mine ? (
				<p>
					<a className="btn" href="/loans#asks">
						{ask.offerCount ? t.askOffersCount(ask.offerCount) : t.askMine}
					</a>
				</p>
			) : mine ? (
				<section className="ask-card">
					<strong>{t.askYouOffered}</strong>
					<p>
						<bdi>{mine.name}</bdi>
						{" · "}
						{comeLine(mine, t)}
						{mine.note ? (
							<>
								{" · "}
								<bdi>{mine.note}</bdi>
							</>
						) : null}
					</p>
					<form action={`/api/ask-offers/${mine.id}/withdraw`} method="post">
						<button type="submit" className="secondary">
							{t.withdraw}
						</button>
					</form>
				</section>
			) : (
				<form
					className="offer-form"
					action={`/api/asks/${ask.id}/offers`}
					method="post"
				>
					<label htmlFor="offer-name">{t.offerName}</label>
					<input
						id="offer-name"
						name="name"
						type="text"
						dir="auto"
						maxLength={80}
						required
						defaultValue={ask.what}
					/>

					<fieldset className="offer-when">
						<legend>{t.offerWhen(asker)}</legend>
						<label className="offer-option">
							<input type="radio" name="come" value="now" defaultChecked />
							<span>{t.offerNow}</span>
							<input
								type="time"
								name="until"
								defaultValue="18:00"
								aria-label={t.offerUntil}
							/>
						</label>
						<label className="offer-option">
							<input type="radio" name="come" value="later" />
							<span>{t.offerLater}</span>
							<input
								type="time"
								name="from"
								defaultValue="17:00"
								aria-label={t.offerFrom}
							/>
						</label>
						<label className="offer-option">
							<input type="radio" name="come" value="usual" />
							<span>
								{t.offerUsual}
								<small className="muted">{t.offerUsualHint}</small>
							</span>
						</label>
					</fieldset>

					{ask.placeMissing ? (
						<>
							<label htmlFor="offer-place">{t.offerPlace}</label>
							<input
								id="offer-place"
								name="meetingPlace"
								type="text"
								dir="auto"
								maxLength={120}
								autoComplete="street-address"
							/>
							<p className="muted">{t.offerPlaceHint}</p>
						</>
					) : null}

					<label htmlFor="offer-note">
						{t.offerNote} <span className="muted">({t.askOptional})</span>
					</label>
					<input
						id="offer-note"
						name="note"
						type="text"
						dir="auto"
						maxLength={200}
					/>

					<p className="muted">{t.offerPrivacy(asker)}</p>
					<div className="offer-actions">
						<button type="submit">{t.offerSend}</button>
						<a className="quiet" href="/">
							{t.offerNotNow}
						</a>
					</div>
				</form>
			)}
		</main>
	);
}
