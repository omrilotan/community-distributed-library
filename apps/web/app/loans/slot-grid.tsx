import type { SlotOption } from "@cdl/contracts";
import type { Locale, Strings } from "../../lib/i18n.ts";
import { dateFormat } from "../../lib/dates.ts";

const PERIODS = ["morning", "afternoon", "evening"] as const;

/**
 * Two weeks as a calendar: a row per day, a cell per part of it. A cell is
 * filled where both are free, outlined where one of you is, and blank where
 * neither is. Each cell is a native radio, so a tap picks it and the form
 * posts as before; no script is needed for any of it. A time already on
 * the table is marked as pending, so a counter-proposal is made knowingly.
 */
export function SlotGrid({
	days,
	options,
	proposed,
	locale,
	t,
}: {
	days: string[];
	options: SlotOption[];
	/** The time one side has put forward, awaiting the other's word. */
	proposed: { day: string; period: string } | null;
	locale: Locale;
	t: Strings;
}) {
	const byKey = new Map(
		options.map((option) => [`${option.day}|${option.period}`, option]),
	);
	const weekday = dateFormat(locale, { weekday: "short" });
	const dayOfMonth = dateFormat(locale, { day: "numeric" });
	const month = dateFormat(locale, { month: "short" });
	const long = dateFormat(locale, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
	const noon = (day: string) => new Date(`${day}T12:00:00Z`);
	const anyBoth = options.some((option) => option.both);
	const anyOne = options.some((option) => !option.both);
	const pending = proposed ? `${proposed.day}|${proposed.period}` : null;

	return (
		<div className="slot-grid" role="radiogroup" aria-label={t.pickSlot}>
			<div className="slot-row slot-head" aria-hidden="true">
				<span />
				{PERIODS.map((period) => (
					<span key={period}>{t.periodName(period)}</span>
				))}
			</div>
			{days.map((day, index) => {
				const date = noon(day);
				// A new month gets named; a Monday starts a week with a breath.
				const newMonth =
					index === 0 ||
					month.format(date) !== month.format(noon(days[index - 1]!));
				const monday = date.getUTCDay() === 1;
				return (
					<div
						key={day}
						className={`slot-row${monday && index > 0 ? " slot-week" : ""}`}
					>
						<span className="slot-date">
							<b>{weekday.format(date)}</b> {dayOfMonth.format(date)}
							{newMonth ? <small> {month.format(date)}</small> : null}
						</span>
						{PERIODS.map((period) => {
							const key = `${day}|${period}`;
							const option = byKey.get(key);
							const mark = key === pending ? " slot-pending" : "";
							if (!option)
								return (
									<span key={period} className={`slot-cell slot-none${mark}`} />
								);
							return (
								<label
									key={period}
									className={`slot-cell ${option.both ? "slot-both" : "slot-one"}${mark}`}
								>
									<input
										type="radio"
										name="slot"
										value={`${day}|${period}`}
										required
									/>
									<span className="sr-only">
										{long.format(date)} · {t.periodName(period)}
										{option.both ? ` · ${t.bothFree}` : ` · ${t.oneFree}`}
										{mark ? ` · ${t.slotPending}` : ""}
									</span>
								</label>
							);
						})}
					</div>
				);
			})}
			<p className="slot-legend muted">
				{anyBoth ? (
					<span>
						<i className="slot-cell slot-both" aria-hidden="true" />{" "}
						{t.bothFree}
					</span>
				) : null}
				{anyOne ? (
					<span>
						<i className="slot-cell slot-one" aria-hidden="true" /> {t.oneFree}
					</span>
				) : null}
				{pending ? (
					<span>
						<i className="slot-cell slot-pending" aria-hidden="true" />{" "}
						{t.slotPending}
					</span>
				) : null}
			</p>
		</div>
	);
}
