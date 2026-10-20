import type { HandoffView, LoanView, SlotOption } from "@cdl/contracts";
import { SlotGrid } from "./slot-grid.tsx";
import { Callout } from "../ui.tsx";
import { AvailabilityNudge } from "./availability-nudge.tsx";
import type { Locale, Strings } from "../../lib/i18n.ts";
import { googleCalendarUrl } from "../../lib/calendar.ts";
import { handoffEvent } from "../../lib/handoff-event.ts";
import { dateFormat } from "../../lib/dates.ts";

/**
 * The "when and where" of a loan, shown on the thread once a loan is accepted
 * (way out) or active (way back). Propose → confirm → meet → code.
 */
export function HandoffPanel({
	loan,
	side,
	handoff,
	options,
	days,
	myGridEmpty,
	placeMissing,
	theirGridEmpty,
	t,
	locale,
	flash,
}: {
	loan: LoanView;
	side: "lender" | "borrower";
	handoff: HandoffView | null;
	options: SlotOption[];
	/** Every day of the window, free or not. */
	days: string[];
	myGridEmpty: boolean;
	/** The host has not saved where to meet. */
	placeMissing: boolean;
	theirGridEmpty: boolean;
	t: Strings;
	locale: Locale;
	flash?: string | undefined;
}) {
	const stage =
		loan.status === "accepted"
			? "out"
			: loan.status === "active"
				? "back"
				: null;
	if (!stage) return null;
	const dayFormat = dateFormat(locale, {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
	const when = (day: string, period: string) =>
		`${dayFormat.format(new Date(`${day}T12:00:00Z`))} · ${t.periodName(period)}`;
	const action = `/api/loans/${loan.id}/handoff`;
	// Who hosts: the holder on the way out (a relay), the owner on the way back.
	const host =
		stage === "out"
			? (loan.relayFrom ?? loan.lender).displayName
			: loan.lender.displayName;
	// Into the member's own calendar: Google takes a link, the rest a file.
	const calendar = handoff ? (
		<p className="calendar-links muted">
			{t.addToCalendar}{" "}
			<a
				href={googleCalendarUrl(handoffEvent(loan, handoff, side, t))}
				target="_blank"
				rel="noopener"
			>
				<bdi>Google</bdi>
			</a>
			{" · "}
			<a href={`/api/loans/${loan.id}/calendar`} download>
				<bdi>{t.otherCalendars}</bdi>
			</a>
		</p>
	) : null;

	return (
		<section className="handoff" id="handoff">
			<h2>{stage === "out" ? t.handoffOut : t.handoffBack}</h2>
			{loan.needsTime ? <Callout tone="warn">{t.needsTimeHint}</Callout> : null}
			{/* Nothing to show the borrower until the host says where. */}
			{side === "lender" && placeMissing ? (
				<Callout tone="warn">
					{t.placeMissingHost} <a href="/settings#availability">{t.setPlace}</a>
				</Callout>
			) : null}
			{flash === "code" ? (
				<p className="callout callout-warn">{t.wrongCode}</p>
			) : null}

			{handoff?.status === "agreed" ? (
				<div className="callout">
					<p>
						<strong>{when(handoff.day, handoff.period)}</strong>
					</p>
					{calendar}
					{handoff.place ? (
						<p>
							{t.meetAt} <bdi>{handoff.place}</bdi>
						</p>
					) : side === "borrower" && handoff.placeMissing ? (
						<p>{t.placeMissingVisitor(host)}</p>
					) : null}
					{handoff.code ? (
						<p>
							{t.yourCode}{" "}
							<code dir="ltr" className="code">
								{handoff.code}
							</code>
							<br />
							<span className="muted">{t.codeHint}</span>
						</p>
					) : (
						<form action={action} method="post" className="request">
							<input type="hidden" name="action" value="complete" />
							<input
								name="code"
								type="text"
								dir="ltr"
								inputMode="text"
								autoCapitalize="characters"
								maxLength={8}
								placeholder={t.enterCode}
								required
							/>
							<button type="submit">{t.confirmHandoff}</button>
						</form>
					)}
					<form action={action} method="post" className="inline">
						<input type="hidden" name="action" value="cancel" />
						<button type="submit" className="link">
							{t.changeTime}
						</button>
					</form>
				</div>
			) : handoff?.status === "proposed" ? (
				<div className="callout">
					<p>
						{handoff.proposedByMe ? t.youProposed : t.theyProposed}{" "}
						<strong>{when(handoff.day, handoff.period)}</strong>
					</p>
					{calendar}
					<div className="actions">
						{handoff.proposedByMe ? null : (
							<form action={action} method="post" className="inline">
								<input type="hidden" name="action" value="confirm" />
								<button type="submit">{t.confirmTime}</button>
							</form>
						)}
						<form action={action} method="post" className="inline">
							<input type="hidden" name="action" value="cancel" />
							<button type="submit" className="link">
								{handoff.proposedByMe ? t.withdraw : t.suggestAnother}
							</button>
						</form>
					</div>
				</div>
			) : null}

			{handoff?.status === "agreed" ? null : (
				<form action={action} method="post">
					<input type="hidden" name="action" value="propose" />
					{myGridEmpty ? <AvailabilityNudge t={t} /> : null}
					<p className="muted">
						{options.length === 0
							? t.noSlots
							: theirGridEmpty
								? t.theirGridEmpty
								: t.pickSlot}
					</p>
					{options.length ? (
						<SlotGrid
							days={days}
							options={options}
							proposed={handoff?.status === "proposed" ? handoff : null}
							locale={locale}
							t={t}
						/>
					) : null}
					{options.length ? (
						<button type="submit" className="secondary">
							{handoff ? t.proposeAnother : t.proposeTime}
						</button>
					) : null}
					{/* The nudge above carries the link when the grid is empty. */}
					{myGridEmpty && side !== "lender" ? null : (
						<p className="muted">
							{myGridEmpty ? null : (
								<a href="/settings#availability">{t.editAvailability}</a>
							)}
							{side === "lender"
								? `${myGridEmpty ? "" : " · "}${t.fallbackHanded}`
								: ""}
						</p>
					)}
				</form>
			)}
		</section>
	);
}
