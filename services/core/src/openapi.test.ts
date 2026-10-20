import { ROUTES } from "@cdl/contracts";
import { describe, expect, it } from "vitest";
import { app } from "./app.ts";

/** Served, but not the API a caller builds on. */
const UNDOCUMENTED = [
	"get /health",
	// Development and tests only; it answers 404 elsewhere.
	"post /v1/dev/library-type",
	// The description itself.
	"get /v1/openapi.json",
];

/**
 * Whether a route core serves answers a described one. Where core takes a
 * word as a parameter (`/:action`), the description names each word.
 */
const answers = (served: string, described: string) =>
	new RegExp(`^${served.replace(/:\w+/g, "[^/]+")}$`).test(described);

describe("the API description", () => {
	const served = app.routes
		.filter(({ method }) =>
			["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method),
		)
		.map(({ method, path }) => `${method.toLowerCase()} ${path}`)
		.filter((route) => !UNDOCUMENTED.includes(route));
	const described = ROUTES.map(({ method, path }) => `${method} ${path}`);

	it("describes every route core serves", () => {
		expect(
			served.filter((route) => !described.some((one) => answers(route, one))),
		).toEqual([]);
	});

	it("describes nothing core does not serve, and each once", () => {
		expect(
			described.filter((one) => !served.some((route) => answers(route, one))),
		).toEqual([]);
		expect(described.length).toBe(new Set(described).size);
	});
});
