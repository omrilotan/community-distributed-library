import { describe, expect, it } from "vitest";
import { z } from "zod";
import { KINDS, kindOf, memberTools, moderatorTools } from "./index.ts";

const every = (type: "books" | "things") => [
	...memberTools(type),
	...moderatorTools(type),
];

describe.each(["books", "things"] as const)("a library of %s", (type) => {
	it("offers each tool once, every one of them classified", () => {
		const names = every(type).map((tool) => tool.name);
		expect(new Set(names).size).toBe(names.length);
		for (const name of names) expect(() => kindOf(name)).not.toThrow();
	});

	it("describes every input as JSON Schema, for WebMCP", () => {
		for (const tool of every(type)) {
			const schema = z.toJSONSchema(z.object(tool.input));
			expect(schema.type).toBe("object");
		}
	});
});

it("classifies nothing that is not a tool", () => {
	const offered = new Set(
		[...every("books"), ...every("things")].map((tool) => tool.name),
	);
	expect(Object.keys(KINDS).filter((name) => !offered.has(name))).toEqual([]);
});

it("says to ask first on anything that changes something", () => {
	expect(kindOf("list_my_shelf").note).toBeNull();
	expect(kindOf("add_copy").note).toMatch(/yes first/);
	expect(kindOf("request_loan").note).toMatch(/another member/);
});
