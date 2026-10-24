import type { Period } from "@cdl/contracts";

/**
 * Putting a handoff in somebody's calendar. A slot is a day and a period, not
 * an hour, so each period stands for the hours it usually means, in the
 * library's own time zone. Google Calendar takes a link; everything else
 * (Apple Calendar, Outlook, the rest) takes an .ics file.
 */
export const LIBRARY_TIME_ZONE = "Europe/London";

const HOURS: Record<Period, [start: number, end: number]> = {
	morning: [9, 12],
	afternoon: [12, 17],
	evening: [17, 20],
};

export interface CalendarEvent {
	uid: string;
	title: string;
	details: string;
	location: string | null;
	start: Date;
	end: Date;
}

/** The period's hours on that day, as instants. */
export function handoffWindow(
	day: string,
	period: Period,
): { start: Date; end: Date } {
	const [from, to] = HOURS[period];
	return { start: localTime(day, from), end: localTime(day, to) };
}

/** An hour on a day in the library's time zone, whatever the clocks are doing. */
function localTime(day: string, hour: number): Date {
	const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
	return new Date(guess.getTime() - offsetMinutes(guess) * 60_000);
}

function offsetMinutes(at: Date): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone: LIBRARY_TIME_ZONE,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		})
			.formatToParts(at)
			.map((part) => [part.type, part.value]),
	);
	const wall = Date.UTC(
		Number(parts.year),
		Number(parts.month) - 1,
		Number(parts.day),
		Number(parts.hour),
		Number(parts.minute),
		Number(parts.second),
	);
	return (wall - at.getTime()) / 60_000;
}

/** 20261006T110000Z: the form both Google and iCalendar take for UTC. */
function stamp(at: Date): string {
	return at
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(event: CalendarEvent): string {
	const url = new URL("https://calendar.google.com/calendar/render");
	url.searchParams.set("action", "TEMPLATE");
	url.searchParams.set("text", event.title);
	url.searchParams.set("dates", `${stamp(event.start)}/${stamp(event.end)}`);
	url.searchParams.set("details", event.details);
	if (event.location) url.searchParams.set("location", event.location);
	return url.href;
}

/** RFC 5545: commas, semicolons, backslashes and line breaks are escaped. */
function text(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

/**
 * RFC 5545 §3.1: a content line is at most 75 octets; the rest continues on
 * the next line after one space. Calendars unfold before parsing, so nothing
 * shown changes. Folding is by code point, so no character is cut in two.
 */
function fold(line: string): string {
	const lines: string[] = [];
	let current = "";
	let octets = 0;
	for (const char of line) {
		const point = char.codePointAt(0)!;
		const size = point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
		if (octets + size > 75) {
			lines.push(current);
			current = " ";
			octets = 1;
		}
		current += char;
		octets += size;
	}
	lines.push(current);
	return lines.join("\r\n");
}

export function icsFile(event: CalendarEvent): string {
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Community Distributed Library//Handoffs//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${event.uid}`,
		`DTSTAMP:${stamp(new Date())}`,
		`DTSTART:${stamp(event.start)}`,
		`DTEND:${stamp(event.end)}`,
		`SUMMARY:${text(event.title)}`,
		`DESCRIPTION:${text(event.details)}`,
		...(event.location ? [`LOCATION:${text(event.location)}`] : []),
		"END:VEVENT",
		"END:VCALENDAR",
		"",
	]
		.map(fold)
		.join("\r\n");
}
