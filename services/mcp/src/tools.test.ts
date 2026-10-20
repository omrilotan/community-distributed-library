import { describe, expect, it } from "vitest";
import { searchPath } from "./tools.ts";

describe("search_catalogue", () => {
	it("searches the whole catalogue, own and read books included", () => {
		const url = new URL(searchPath({ query: "הררי" }), "http://cdl-core");
		expect(url.pathname).toBe("/v1/search");
		expect(url.searchParams.get("q")).toBe("הררי");
		// What a person browsing leaves out, an assistant checking for a
		// duplicate must see.
		expect(url.searchParams.get("showMine")).toBe("1");
		expect(url.searchParams.get("showRead")).toBe("1");
	});

	it("carries the narrowing along", () => {
		const url = new URL(
			searchPath({
				query: "x",
				withinMetres: 800,
				offset: 20,
				tags: ["genre:poetry"],
			}),
			"http://cdl-core",
		);
		expect(url.searchParams.get("within")).toBe("800");
		expect(url.searchParams.get("offset")).toBe("20");
		expect(url.searchParams.get("tags")).toBe("genre:poetry");
	});
});
