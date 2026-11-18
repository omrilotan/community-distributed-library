import { describe, expect, it } from "vitest";
import { strings } from "./i18n.ts";
import { whyNot } from "./invite-words.ts";

const en = strings("en");
const he = strings("he");
// Thursday 19 November 2026, midnight to midnight in London.
const START = Date.UTC(2026, 10, 19, 0, 0) / 1000;
const END = START + 86_400;

describe("what a link that cannot let anyone in says", () => {
	it("tells one person's spent link from a full group's", () => {
		expect(whyNot({ state: "used", maxUses: 1 }, en)).toBe(en.inviteOneUsed);
		expect(whyNot({ state: "used", maxUses: 50 }, en)).toBe(
			"This invite is full: all 50 places have been taken.",
		);
	});

	it("names the day of an event's link, before and after it", () => {
		expect(
			whyNot({ state: "early", startsAt: START, expiresAt: END }, en),
		).toBe("This invite opens on Thursday 19 Nov. Come back then.");
		expect(
			whyNot({ state: "expired", startsAt: START, expiresAt: END }, en),
		).toBe("This invite was for Thursday 19 Nov only.");
	});

	it("keeps it plain for a link that ran for days", () => {
		expect(
			whyNot({ state: "expired", startsAt: null, expiresAt: END }, en),
		).toBe("This invite has expired.");
		expect(
			whyNot(
				{ state: "expired", startsAt: START, expiresAt: END + 86_400 * 3 },
				en,
			),
		).toBe("This invite has expired.");
	});

	it("says nothing for a usable link", () => {
		expect(whyNot({ state: "usable" }, en)).toBeNull();
	});

	it("speaks Hebrew too", () => {
		expect(whyNot({ state: "used", maxUses: 1 }, he)).toBe(he.inviteOneUsed);
		expect(whyNot({ state: "used", maxUses: 12 }, he)).toContain("12");
		expect(
			whyNot({ state: "early", startsAt: START, expiresAt: END }, he),
		).toContain("19");
	});
});
