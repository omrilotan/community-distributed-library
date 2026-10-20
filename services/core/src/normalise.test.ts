import { describe, expect, it } from "vitest";
import { searchKey } from "./normalise.ts";

describe("searchKey", () => {
	it("strips niqqud so pointed and unpointed text match", () => {
		expect(searchKey("שָׁלוֹם")).toBe(searchKey("שלום"));
	});

	it("folds final letters so a word matches mid-word and end-of-word forms", () => {
		expect(searchKey("עגנון")).toBe("עגנונ");
		expect(searchKey("ספרים")).toBe("ספרימ");
	});

	it("drops geresh and gershayim used in abbreviations", () => {
		expect(searchKey("מסת״ב")).toBe("מסתב");
	});

	it("case-folds Latin and removes diacritics", () => {
		expect(searchKey("Émile Zola")).toBe("emile zola");
	});

	it("collapses whitespace", () => {
		expect(searchKey("  Frank   Herbert ")).toBe("frank herbert");
	});
});
