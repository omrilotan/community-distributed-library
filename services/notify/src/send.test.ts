import { describe, expect, it, vi } from "vitest";
import Notify, { type Env } from "./index.ts";

const message = {
	kind: "invitation",
	libraryType: "books",
	to: "noa@example.com",
	locale: "en",
	url: "https://library.example.org/auth/callback?token=x",
	inviterName: "Dana",
	communityName: "Staging",
	expiresInDays: 14,
};

const notify = (env: Partial<Env>) =>
	new Notify(
		{} as never,
		{
			FROM_ADDRESS: "library@example.org",
			FROM_NAME: "Staging",
			...env,
		} as Env,
	);

const refusing = (code: string) => ({
	send: vi.fn().mockRejectedValue(Object.assign(new Error(code), { code })),
});

describe("sending an email", () => {
	it("goes through Cloudflare, from the library's name and address", async () => {
		const EMAIL = { send: vi.fn().mockResolvedValue({ messageId: "m" }) };
		const delivery = await notify({ EMAIL } as never).send(message);
		expect(delivery).toEqual({ delivered: true, channel: "email" });
		expect(EMAIL.send).toHaveBeenCalledWith(
			expect.objectContaining({
				from: { name: "Staging", email: "library@example.org" },
				to: "noa@example.com",
			}),
		);
	});

	it("gives up on an address Cloudflare has suppressed", async () => {
		const delivery = await notify({
			EMAIL: refusing("E_RECIPIENT_SUPPRESSED"),
		} as never).send(message);
		expect(delivery).toEqual({
			delivered: false,
			channel: "email",
			retry: false,
		});
	});

	it("tries again later when Cloudflare is busy", async () => {
		const delivery = await notify({
			EMAIL: refusing("E_RATE_LIMIT_EXCEEDED"),
		} as never).send(message);
		expect(delivery).toEqual({
			delivered: false,
			channel: "email",
			retry: true,
		});
	});

	it("logs the message when there is no way to send it", async () => {
		const delivery = await notify({}).send(message);
		expect(delivery).toEqual({ delivered: false, channel: "console" });
	});
});
