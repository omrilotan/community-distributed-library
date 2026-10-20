import { describe, expect, it } from "vitest";
import { decode, madeWith } from "./push-key.ts";

const KEY =
	"BDkAcS-d7XbPhe_5dJ7DDDCPP6Qy-CdrutA9JHpvseXA986hNgZk5Zv88CwlXHCHJteaG5bTdu8_AcXJMfPDMrw";
const OTHER =
	"BBO_VfTtbYGQlUag1oc-4302CQ_FsMBbRzE4KC96nEhSXj-0zI-XN6gA6Ww2mhiSCbMxtVHlkk5ukrsqMZA_FeM";

function subscribedWith(key: ArrayBuffer | null) {
	return { options: { applicationServerKey: key } } as PushSubscription;
}

describe("madeWith", () => {
	it("knows a subscription made under the same key", () => {
		expect(
			madeWith(subscribedWith(decode(KEY).buffer as ArrayBuffer), KEY),
		).toBe(true);
	});

	it("spots one made under another key", () => {
		expect(
			madeWith(subscribedWith(decode(OTHER).buffer as ArrayBuffer), KEY),
		).toBe(false);
	});

	it("treats a subscription with no key as stale", () => {
		expect(madeWith(subscribedWith(null), KEY)).toBe(false);
	});
});

describe("decode", () => {
	it("reads a 65-byte uncompressed public key", () => {
		const bytes = decode(KEY);
		expect(bytes.length).toBe(65);
		expect(bytes[0]).toBe(4);
	});
});
