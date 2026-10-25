import { describe, expect, it } from "vitest";
import { publicTarget } from "./webhook-target.ts";

describe("a webhook's address", () => {
	it("may be a public https name or address", () => {
		for (const url of [
			"https://hooks.example.com/in",
			"https://example.org:8443/x",
			"https://8.8.8.8/hook",
			"https://[2606:4700:4700::1111]/hook",
		])
			expect(publicTarget(url), url).toBe(true);
	});

	it("is never this machine, a private network or a reserved range", () => {
		for (const url of [
			"http://hooks.example.com/in",
			"https://localhost/hook",
			"https://api.localhost/hook",
			"https://printer.local/hook",
			"https://db.internal/hook",
			"https://router.home.arpa/",
			"https://intranet/hook",
			"https://127.0.0.1/hook",
			"https://2130706433/hook",
			"https://0x7f.1/hook",
			"https://10.0.0.5/hook",
			"https://172.20.1.1/hook",
			"https://192.168.1.1/hook",
			"https://100.64.0.1/hook",
			"https://169.254.169.254/latest/meta-data",
			"https://0.0.0.0/hook",
			"https://198.18.0.1/hook",
			"https://203.0.113.9/hook",
			"https://224.0.0.1/hook",
			"https://255.255.255.255/hook",
			"https://[::1]/hook",
			"https://[::]/hook",
			"https://[fd00::1]/hook",
			"https://[fe80::1]/hook",
			"https://[::ffff:127.0.0.1]/hook",
			"https://[::ffff:10.0.0.1]/hook",
			"https://[64:ff9b::a00:1]/hook",
			"https://[2001:db8::1]/hook",
			"https://[2002:7f00:1::1]/hook",
			"https://[ff02::1]/hook",
			"not a url",
		])
			expect(publicTarget(url), url).toBe(false);
	});

	it("may be localhost in development, and only there", () => {
		expect(publicTarget("http://localhost:9999/hook", true)).toBe(true);
		expect(publicTarget("http://127.0.0.1:9999/hook", true)).toBe(true);
		expect(publicTarget("http://10.0.0.5/hook", true)).toBe(false);
		expect(publicTarget("http://localhost:9999/hook")).toBe(false);
	});
});
