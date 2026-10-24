import { WorkerEntrypoint } from "cloudflare:workers";
import { Message, type Delivery } from "@cdl/contracts";
import { render } from "./templates.ts";
import { sendPush, type Subscription } from "./push.ts";

export interface Env {
	FROM_ADDRESS: string;
	FROM_NAME: string;
	/** Cloudflare Email Sending, for the domain FROM_ADDRESS is on. */
	EMAIL?: SendEmail;
	/**
	 * Secret, while email moves to Cloudflare: Resend takes a message that
	 * Cloudflare could not. Without either, development logs the message.
	 */
	RESEND_API_KEY?: string;
	/** VAPID public key, base64url. Handed to browsers when they subscribe. */
	VAPID_PUBLIC_KEY?: string;
	/** Secret: the matching private key as a JWK. */
	VAPID_PRIVATE_JWK?: string;
}

/**
 * Delivery only. `core` decides what to say; this service decides how it
 * travels. Swap the channel and nothing upstream changes (decision 0013).
 *
 * Email goes through Cloudflare Email Sending, with Resend behind it for
 * as long as a library still has a Resend key.
 */
export default class Notify extends WorkerEntrypoint<Env> {
	/**
	 * A push to the member's devices. Returns how many took it, so core can
	 * decide whether an email still needs to follow, and which took it, threw
	 * it away or refused it, so core can keep count.
	 */
	async push(
		subscriptions: (Subscription & { id: string })[],
		input: unknown,
	): Promise<{
		sent: number;
		gone: string[];
		delivered: string[];
		failed: string[];
	}> {
		const message = Message.parse(input);
		const rendered = render(message);
		// The same wording as the email, cut to what a notification shows.
		const notification = {
			title: rendered.subject,
			body: rendered.text.split("\n").find((line) => line.trim()) ?? "",
			url: "url" in message ? message.url : "/",
			tag: message.kind,
		};
		const vapid = this.env.VAPID_PRIVATE_JWK;
		if (!vapid || !this.env.VAPID_PUBLIC_KEY) {
			console.log("[notify:push] no VAPID keys; skipping", notification.title);
			return { sent: 0, gone: [], delivered: [], failed: [] };
		}
		const config = {
			publicKey: this.env.VAPID_PUBLIC_KEY,
			privateJwk: JSON.parse(vapid) as JsonWebKey,
			subject: `mailto:${this.env.FROM_ADDRESS}`,
		};

		const gone: string[] = [];
		const delivered: string[] = [];
		const failed: string[] = [];
		await Promise.all(
			subscriptions.map(async (subscription) => {
				const response = await sendPush(
					subscription,
					notification,
					config,
				).catch((error: unknown) => {
					console.error("[notify:push] failed", error);
					return null;
				});
				// 404 and 410 mean the browser threw the subscription away.
				if (response && (response.status === 404 || response.status === 410)) {
					gone.push(subscription.id);
				} else if (response?.ok) {
					delivered.push(subscription.id);
				} else {
					if (response)
						console.error("[notify:push] rejected", response.status);
					failed.push(subscription.id);
				}
			}),
		);
		return { sent: delivered.length, gone, delivered, failed };
	}

	async send(input: unknown): Promise<Delivery> {
		const message = Message.parse(input);
		const rendered = render(message);

		const email = {
			from: { name: this.env.FROM_NAME, email: this.env.FROM_ADDRESS },
			to: message.to,
			subject: rendered.subject,
			text: rendered.text,
			html: rendered.html,
		};

		if (this.env.EMAIL) {
			const failure = await this.env.EMAIL.send(email).then(
				() => null,
				(error: unknown) => error as { code?: string; message?: string },
			);
			if (!failure) return { delivered: true, channel: "email" };
			console.error(
				"[notify:cloudflare] send failed",
				failure.code,
				failure.message,
			);
			// The address bounced before, or the message itself is wrong: no
			// other service would do better, and later would fail the same.
			if (REFUSED.has(failure.code ?? ""))
				return { delivered: false, channel: "email", retry: false };
			if (!this.env.RESEND_API_KEY)
				return { delivered: false, channel: "email", retry: true };
		}

		if (!this.env.RESEND_API_KEY) {
			// Neither service means local development, or production gone
			// missing its binding: say what would have gone, never a sign-in
			// link, which core already hands a developer as debugUrl.
			console.log(
				`[notify:console] to=${message.to} subject=${rendered.subject}${
					// Either one carries a link that signs somebody in.
					message.kind === "magic_link" || message.kind === "invitation"
						? ""
						: `\n${rendered.text}`
				}`,
			);
			return { delivered: false, channel: "console" };
		}

		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				authorization: `Bearer ${this.env.RESEND_API_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				from: `${email.from.name} <${email.from.email}>`,
				to: [email.to],
				subject: email.subject,
				text: email.text,
				html: email.html,
			}),
		}).catch((error: unknown) => {
			console.error("[notify:resend] request failed", error);
			return null;
		});

		if (!response?.ok) {
			console.error(
				"[notify:resend] send failed",
				response?.status,
				await response?.text(),
			);
			// Unreachable, rate-limited or failing on their side: worth another
			// go later. Anything else (a bad address) would fail again.
			const retry =
				!response || response.status === 429 || response.status >= 500;
			return { delivered: false, channel: "email", retry };
		}
		return { delivered: true, channel: "email" };
	}

	override async fetch(): Promise<Response> {
		return new Response("notify", { status: 200 });
	}
}

/**
 * Cloudflare's refusals that are about this message, not the moment: a
 * suppressed or disallowed address, or a message it cannot take. Anything
 * else (limits, delivery, its own trouble) is worth another go.
 */
const REFUSED = new Set([
	"E_RECIPIENT_SUPPRESSED",
	"E_RECIPIENT_NOT_ALLOWED",
	"E_VALIDATION_ERROR",
	"E_FIELD_MISSING",
	"E_TOO_MANY_RECIPIENTS",
	"E_CONTENT_TOO_LARGE",
]);
