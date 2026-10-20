import { describe, expect, it } from "vitest";
import { api, as, SAM } from "../test/api.ts";

describe("signing in on another device", () => {
	it("gives the member a one-time link that makes a session once", async () => {
		const made = await as(SAM).post("/v1/me/device-link", {});
		expect(made.status).toBe(201);
		const token = new URL(made.body.url).searchParams.get("token");
		expect(token).toBeTruthy();

		const first = await api(null, "POST", "/v1/auth/exchange", { token });
		expect(first.status).toBe(200);
		expect(first.body.token).toBeTruthy();
		// Used: it will not work a second time.
		const again = await api(null, "POST", "/v1/auth/exchange", { token });
		expect(again.status).not.toBe(200);
	});

	it("is never handed to an assistant", async () => {
		const minted = await as(SAM).post("/v1/me/tokens", {
			clientName: "Test Assistant",
			scopes: ["profile:read"],
		});
		const asked = await api(
			{ token: minted.body.token },
			"POST",
			"/v1/me/device-link",
			{},
		);
		expect(asked.status).toBe(403);
	});

	it("needs someone signed in", async () => {
		expect((await api(null, "POST", "/v1/me/device-link", {})).status).toBe(
			401,
		);
	});
});
