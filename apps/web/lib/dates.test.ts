import { describe, expect, it } from "vitest";
import { dateFormat } from "./dates.ts";

describe("dates on the site", () => {
	it("are in the library's own time, summer and winter", () => {
		const time = dateFormat("en-GB", { timeStyle: "short" });
		// 13:30 UTC is 14:30 in London in July, and 13:30 in January.
		expect(time.format(Date.UTC(2026, 6, 1, 13, 30))).toBe("14:30");
		expect(time.format(Date.UTC(2026, 0, 1, 13, 30))).toBe("13:30");
	});

	it("change day at London's midnight, not UTC's", () => {
		const day = dateFormat("en-GB", { day: "numeric" });
		expect(day.format(Date.UTC(2026, 6, 1, 23, 30))).toBe("2");
	});
});
