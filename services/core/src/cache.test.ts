import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { forget, fragment, vocabularyKey } from "./cache.ts";
import type { Env } from "./env.ts";

/** The real env reads through, as development does; this one caches. */
const caching = { ...env, DEV_AUTH: undefined } as unknown as Env;
const key = (name: string) => `${name}:${Math.random().toString(36).slice(2)}`;

describe("the fragment cache", () => {
	it("builds once and answers from the store after that", async () => {
		const name = key("test");
		let built = 0;
		const build = async () => {
			built += 1;
			return { value: built };
		};

		expect(await fragment(caching, undefined, name, 60, build)).toEqual({
			value: 1,
		});
		expect(await fragment(caching, undefined, name, 60, build)).toEqual({
			value: 1,
		});
		expect(built).toBe(1);
	});

	it("answers a stored null from the store too", async () => {
		const name = key("test");
		let built = 0;
		const build = async () => {
			built += 1;
			return null;
		};

		expect(await fragment(caching, undefined, name, 60, build)).toBeNull();
		expect(await fragment(caching, undefined, name, 60, build)).toBeNull();
		expect(built).toBe(1);
	});

	it("builds again once the fragment is forgotten", async () => {
		const name = key("test");
		let built = 0;
		const build = async () => ({ value: (built += 1) });

		await fragment(caching, undefined, name, 60, build);
		await forget(caching, name);
		await fragment(caching, undefined, name, 60, build);
		expect(built).toBe(2);
	});

	it("keeps fragments apart, so forgetting one leaves the others", async () => {
		const one = key("one");
		const two = key("two");
		let builtTwo = 0;
		await fragment(caching, undefined, one, 60, async () => ({ n: 1 }));
		await fragment(caching, undefined, two, 60, async () => ({
			n: (builtTwo += 1),
		}));

		await forget(caching, one);
		await fragment(caching, undefined, two, 60, async () => ({
			n: (builtTwo += 1),
		}));
		expect(builtTwo).toBe(1);
	});

	it("reads through where a write must be visible at once", async () => {
		const name = key("test");
		let built = 0;
		const build = async () => ({ value: (built += 1) });
		// `env` here is the test environment, which sets DEV_AUTH.
		await fragment(env as unknown as Env, undefined, name, 60, build);
		await fragment(env as unknown as Env, undefined, name, 60, build);
		expect(built).toBe(2);
	});

	it("names a community's vocabulary on its own", () => {
		expect(vocabularyKey("a")).not.toBe(vocabularyKey("b"));
	});
});
