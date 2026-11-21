import type { MyAsks } from "@cdl/contracts";
import type { Strings } from "../../lib/i18n.ts";
import { AskTags, comeLine } from "../asks/ask-parts.tsx";

/**
 * Asks on the loans page: what I asked for and who offered, what I offered
 * and am waiting to hear about, and what I offered that I may keep on my
 * shelf. Nothing shows when there is none of it.
 */
export function AsksOnLoans({ mine, t }: { mine: MyAsks; t: Strings }) {
	if (!mine.asks.length && !mine.offers.length && !mine.keep.length)
		return null;
	return (
		<section id="asks" className="asks-mine">
			{mine.asks.map((ask) => (
				<article className="ask-card" key={ask.id}>
					<div className="ask-head">
						<span className="muted">{t.askMine}</span>
						<AskTags ask={ask} t={t} />
					</div>
					<h2>
						<bdi>{ask.what}</bdi>
					</h2>
					{ask.note ? (
						<p className="muted">
							<bdi>{ask.note}</bdi>
						</p>
					) : null}
					{ask.offers.length ? (
						<>
							<h3>{t.askOffersCount(ask.offers.length)}</h3>
							<ul className="ask-offers">
								{ask.offers.map((offer) => (
									<li key={offer.id}>
										<div>
											<strong>
												<bdi>{offer.name}</bdi>
											</strong>
											<div className="muted">
												<bdi>{offer.by.displayName}</bdi>
												{" · "}
												{comeLine(offer, t)}
												{offer.note ? (
													<>
														{" · "}
														<bdi>{offer.note}</bdi>
													</>
												) : null}
											</div>
										</div>
										<form action={`/api/asks/${ask.id}/take`} method="post">
											<input type="hidden" name="offerId" value={offer.id} />
											<button type="submit">{t.askTake}</button>
										</form>
									</li>
								))}
							</ul>
							<p className="muted">{t.askTakeHint}</p>
						</>
					) : (
						<p className="muted">{t.askNoOffers}</p>
					)}
					<form action={`/api/asks/${ask.id}/close`} method="post">
						<button type="submit" className="quiet">
							{t.askClose}
						</button>
					</form>
				</article>
			))}

			{mine.offers.length ? (
				<article className="ask-card">
					<h2>{t.offersMine}</h2>
					<ul className="ask-offers">
						{mine.offers.map(({ offer, ask }) => (
							<li key={offer.id}>
								<div>
									<strong>
										<bdi>{offer.name}</bdi>
									</strong>
									<div className="muted">
										{t.offerTo(ask.asker.displayName)}
										{" · "}
										{comeLine(offer, t)}
									</div>
								</div>
								<form
									action={`/api/ask-offers/${offer.id}/withdraw`}
									method="post"
								>
									<button type="submit" className="quiet">
										{t.withdraw}
									</button>
								</form>
							</li>
						))}
					</ul>
				</article>
			) : null}

			{mine.keep.map((prompt) => (
				<article className="ask-card ask-keep" key={prompt.offerId}>
					<p className="muted">
						{prompt.after === "returned"
							? t.keepReturned(prompt.askerName)
							: t.keepSorted(prompt.askerName)}
					</p>
					<h2>{t.keepTitle(prompt.name)}</h2>
					<p className="muted">{t.keepHint}</p>
					<form
						className="ask-choice"
						action={`/api/ask-offers/${prompt.offerId}/keep`}
						method="post"
					>
						<button type="submit" name="keep" value="1" className="secondary">
							{t.keepYes}
						</button>
						<button type="submit" name="keep" value="0" className="secondary">
							{t.keepNo}
						</button>
					</form>
					<p className="muted">{t.keepNote}</p>
				</article>
			))}
		</section>
	);
}
