import { LIBRARY_TIME_ZONE } from "./calendar.ts";

/**
 * Dates and times as the library's members read them: in its own time zone.
 * Pages are drawn in a Worker, whose clock is UTC, so a formatter without a
 * zone is an hour out all summer: a message sent at 14:30 read 13:30.
 */
export function dateFormat(
	locale: string | undefined,
	options: Intl.DateTimeFormatOptions = {},
): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat(locale, {
		timeZone: LIBRARY_TIME_ZONE,
		...options,
	});
}
