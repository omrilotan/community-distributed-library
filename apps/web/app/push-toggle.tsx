"use client";

import { useEffect, useState } from "react";
import { decode } from "../lib/push-key.ts";

interface Labels {
	on: string;
	off: string;
	enable: string;
	disable: string;
	blocked: string;
	unsupported: string;
	hint: string;
	test: string;
	testSent: string;
	testFailed: string;
	testLimit: string;
}

type State = "loading" | "unsupported" | "blocked" | "on" | "off" | "working";

/**
 * Notifications on this device. One row per browser, so a phone and a laptop
 * are asked separately — which is what a member expects, since they carry one
 * of them around.
 */
export function PushToggle({
	labels,
	nudge,
}: {
	labels: Labels;
	/**
	 * Elsewhere than the profile: shown only while notifications are off on
	 * this device (not blocked, not unsupported), as this line and one button.
	 */
	nudge?: string;
}) {
	const [state, setState] = useState<State>("loading");
	// Turned on from the nudge: say so once, rather than vanish.
	const [justOn, setJustOn] = useState(false);
	// What the last test said, shown beside the button.
	const [tested, setTested] = useState<string | null>(null);

	useEffect(() => {
		if (
			typeof window === "undefined" ||
			!("serviceWorker" in navigator) ||
			!("PushManager" in window)
		) {
			setState("unsupported");
			return;
		}
		if (Notification.permission === "denied") {
			setState("blocked");
			return;
		}
		navigator.serviceWorker
			.getRegistration()
			.then((registration) => registration?.pushManager.getSubscription())
			.then((subscription) => setState(subscription ? "on" : "off"))
			.catch(() => setState("off"));
	}, []);

	async function enable() {
		setState("working");
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				setState(permission === "denied" ? "blocked" : "off");
				return;
			}
			const { publicKey } = (await fetch("/api/v1/push/key").then((response) =>
				response.json(),
			)) as { publicKey: string | null };
			if (!publicKey) throw new Error("no key");

			const registration = await navigator.serviceWorker.register("/sw.js");
			await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				// The DOM types want a BufferSource; a Uint8Array is one.
				applicationServerKey: decode(publicKey) as BufferSource,
			});
			const saved = await fetch("/api/me/push", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(subscription.toJSON()),
			});
			setState(saved.ok ? "on" : "off");
			setJustOn(saved.ok);
		} catch {
			setState("off");
		}
	}

	async function test() {
		setTested(null);
		try {
			const registration = await navigator.serviceWorker.getRegistration();
			const subscription = await registration?.pushManager.getSubscription();
			if (!subscription) {
				setState("off");
				return;
			}
			const response = await fetch("/api/me/push/test", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ endpoint: subscription.endpoint }),
			});
			if (response.status === 429) {
				setTested(labels.testLimit);
				return;
			}
			const result = (await response.json()) as { sent?: number };
			setTested(result.sent ? labels.testSent : labels.testFailed);
		} catch {
			setTested(labels.testFailed);
		}
	}

	async function disable() {
		setState("working");
		try {
			const registration = await navigator.serviceWorker.getRegistration();
			const subscription = await registration?.pushManager.getSubscription();
			if (subscription) {
				await fetch(
					`/api/me/push?endpoint=${encodeURIComponent(subscription.endpoint)}`,
					{ method: "DELETE" },
				);
				await subscription.unsubscribe();
			}
		} catch {
			// Losing the record locally is not worth a message; the server row
			// goes stale and is dropped on the first rejected push.
		}
		setState("off");
	}

	if (state === "loading") return null;
	if (nudge !== undefined) {
		if (state === "on")
			return justOn ? (
				<p className="callout" role="status">
					{labels.on}
				</p>
			) : null;
		if (state !== "off" && state !== "working") return null;
		return (
			<div className="callout push-nudge">
				<span>{nudge}</span>
				<button
					type="button"
					disabled={state === "working"}
					onClick={() => void enable()}
				>
					{labels.enable}
				</button>
			</div>
		);
	}
	if (state === "unsupported")
		return <p className="muted">{labels.unsupported}</p>;
	if (state === "blocked") return <p className="muted">{labels.blocked}</p>;

	// Stacked, not one run-on line: where it stands, what to do, why.
	return (
		<div className="push-toggle">
			<p className="push-state">{state === "on" ? labels.on : labels.off}</p>
			<p className="actions">
				<button
					type="button"
					className="secondary"
					disabled={state === "working"}
					onClick={() => void (state === "on" ? disable() : enable())}
				>
					{state === "on" ? labels.disable : labels.enable}
				</button>
				{state === "on" ? (
					<button
						type="button"
						className="secondary"
						onClick={() => void test()}
					>
						{labels.test}
					</button>
				) : null}
			</p>
			{tested ? (
				<p className="callout" role="status">
					{tested}
				</p>
			) : null}
			<p className="muted">{labels.hint}</p>
		</div>
	);
}
