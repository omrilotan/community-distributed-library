import { describe, expect, it, vi } from "vitest";

// The site's address comes from the Worker's environment, absent here.
vi.mock("cloudflare:workers", () => ({
	env: { APP_URL: "https://library.test" },
}));
import type { HandoffView, LoanView } from "@cdl/contracts";
import { handoffEvent } from "./handoff-event.ts";
import { strings } from "./i18n.ts";

const person = (id: string, displayName: string) => ({
	id,
	displayName,
	areaLabel: null,
	suspended: false,
});

const relay = {
	id: "loan",
	copy: { title: "Oz" },
	borrower: person("noa", "Noa"),
	lender: person("dana", "Dana"),
	relayFrom: { id: "sam", displayName: "Sam", suspended: false },
} as unknown as LoanView;

const out = {
	id: "handoff",
	direction: "out",
	day: "2026-10-06",
	period: "morning",
	place: null,
} as unknown as HandoffView;

describe("a handoff in the calendar", () => {
	it("names whoever the borrower meets: on a relay, the reader handing it on", () => {
		const t = strings("en");
		expect(handoffEvent(relay, out, "borrower", t).title).toContain("Sam");
		expect(handoffEvent(relay, out, "borrower", t).title).not.toContain("Dana");
		// The reader handing it on meets the borrower.
		expect(handoffEvent(relay, out, "lender", t).title).toContain("Noa");
		// On the way back it goes to its owner.
		const back = { ...out, direction: "back" } as HandoffView;
		expect(handoffEvent(relay, back, "borrower", t).title).toContain("Dana");
	});
});
