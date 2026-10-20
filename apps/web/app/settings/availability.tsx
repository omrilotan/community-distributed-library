import type { Availability } from "@cdl/contracts";
import type { Strings } from "../../lib/i18n.ts";

const PERIODS = ["morning", "afternoon", "evening"] as const;

/**
 * A week as a grid of tap cells — the same cells the loan's calendar uses,
 * each a native checkbox — plus the private meeting place. Fields only: the
 * profile's one form sends them. No JavaScript.
 */
export function AvailabilityFields({
	value,
	t,
}: {
	value: Availability;
	t: Strings;
}) {
	return (
		<>
			<p className="muted">{t.availabilityHint}</p>
			<WeekGrid value={value} t={t} />
			<label htmlFor="meetingPlace">{t.meetingPlace}</label>
			<input
				id="meetingPlace"
				name="meetingPlace"
				type="text"
				dir="auto"
				maxLength={120}
				defaultValue={value.meetingPlace ?? ""}
				placeholder={t.meetingPlaceHint}
			/>
			<p className="muted">{t.meetingPlacePrivacy}</p>
		</>
	);
}

/** The seven days by three parts of a day, ticked where the member is free. */
export function WeekGrid({ value, t }: { value: Availability; t: Strings }) {
	const set = new Set(
		value.slots.map((slot) => `${slot.weekday}:${slot.period}`),
	);
	return (
		<div className="slot-grid" role="group" aria-label={t.availabilityTitle}>
			<div className="slot-row slot-head" aria-hidden="true">
				<span />
				{PERIODS.map((period) => (
					<span key={period}>{t.periodName(period)}</span>
				))}
			</div>
			{[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
				<div className="slot-row" key={weekday}>
					<span className="slot-date">
						<b>{t.weekdayName(weekday)}</b>
					</span>
					{PERIODS.map((period) => (
						<label className="slot-cell slot-one" key={period}>
							<input
								type="checkbox"
								name="slot"
								value={`${weekday}:${period}`}
								defaultChecked={set.has(`${weekday}:${period}`)}
							/>
							<span className="sr-only">
								{t.weekdayName(weekday)} · {t.periodName(period)}
							</span>
						</label>
					))}
				</div>
			))}
		</div>
	);
}
