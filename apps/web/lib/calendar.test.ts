import { describe, expect, it } from "vitest";
import { googleCalendarUrl, handoffWindow, icsFile } from "./calendar.ts";

describe("a handoff in a calendar", () => {
	it("reads a period as London hours, summer and winter", () => {
		// British Summer Time: an hour ahead of UTC.
		expect(handoffWindow("2026-07-01", "afternoon").start.toISOString()).toBe(
			"2026-07-01T11:00:00.000Z",
		);
		// Greenwich Mean Time: UTC itself.
		expect(handoffWindow("2026-12-01", "evening").end.toISOString()).toBe(
			"2026-12-01T20:00:00.000Z",
		);
	});

	const event = {
		uid: "handoff-1@library",
		title: "Returning Oz",
		details: "Arrange it at https://example.test/loans/1",
		location: "Church End, by the library; side door",
		...handoffWindow("2026-10-06", "morning"),
	};

	it("links to Google Calendar with the times in UTC", () => {
		const url = new URL(googleCalendarUrl(event));
		expect(url.host).toBe("calendar.google.com");
		expect(url.searchParams.get("dates")).toBe(
			"20261006T080000Z/20261006T110000Z",
		);
		expect(url.searchParams.get("location")).toBe(event.location);
	});

	it("writes an iCalendar file other calendars open", () => {
		const file = icsFile(event);
		expect(file).toContain("BEGIN:VEVENT\r\n");
		expect(file).toContain("DTSTART:20261006T080000Z");
		expect(file).toContain(
			"LOCATION:Church End\\, by the library\\; side door",
		);
	});

	it("folds lines longer than 75 octets, as RFC 5545 asks", () => {
		const title = "א".repeat(60);
		const file = icsFile({ ...event, title });
		const lines = file.split("\r\n");
		expect(lines.some((line) => line.startsWith(" "))).toBe(true);
		for (const line of lines) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
		// Unfolded, the line is whole again.
		expect(file.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}\r\n`);
	});
});
