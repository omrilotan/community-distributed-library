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

describe("an event's day", () => {
	it("runs midnight to midnight in the library's time", async () => {
		const { dayBounds } = await import("./calendar.ts");
		const winter = dayBounds("2026-11-19");
		expect(winter.start.toISOString()).toBe("2026-11-19T00:00:00.000Z");
		expect(winter.end.toISOString()).toBe("2026-11-20T00:00:00.000Z");
		const summer = dayBounds("2026-07-01");
		expect(summer.start.toISOString()).toBe("2026-06-30T23:00:00.000Z");
		expect(summer.end.toISOString()).toBe("2026-07-01T23:00:00.000Z");
	});

	it("is 23 hours long the day the clocks go forward", async () => {
		const { dayBounds } = await import("./calendar.ts");
		const { start, end } = dayBounds("2026-03-29");
		expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
	});

	it("knows today as London does", async () => {
		const { libraryToday } = await import("./calendar.ts");
		expect(libraryToday(new Date(Date.UTC(2026, 6, 1, 23, 30)))).toBe(
			"2026-07-02",
		);
	});
});
