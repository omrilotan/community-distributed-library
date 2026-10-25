/** A VAPID public key, base64url as the server hands it out, as bytes. */
export function decode(value: string): Uint8Array {
	const padded = (value + "=".repeat((4 - (value.length % 4)) % 4))
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const binary = atob(padded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Whether a subscription was made with this server key. */
export function madeWith(subscription: PushSubscription, key: string): boolean {
	const used = subscription.options.applicationServerKey;
	if (!used) return false;
	const want = decode(key);
	const have = new Uint8Array(used);
	return (
		have.length === want.length && have.every((byte, i) => byte === want[i])
	);
}

/**
 * When the server's key changes (a new key pair after a move), a browser
 * keeps its old subscription and shows notifications as on, while every push
 * to it is refused. Swap it for one under the new key; the member already
 * said yes, so no prompt is shown. Quiet on any failure.
 *
 * `known` is the key the page came with (lib/push-public-key.ts). A
 * subscription made under it needs nothing more; otherwise the key is asked
 * for afresh, since the page's copy may be a minute old.
 */
export async function renewIfStale(
	registration: ServiceWorkerRegistration,
	known: string | null,
): Promise<void> {
	if (Notification.permission !== "granted") return;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) return;
	if (known && madeWith(subscription, known)) return;
	const { publicKey } = (await fetch("/api/v1/push/key").then((response) =>
		response.json(),
	)) as { publicKey: string | null };
	if (!publicKey || madeWith(subscription, publicKey)) return;
	await subscription.unsubscribe();
	const renewed = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		// The DOM types want a BufferSource; a Uint8Array is one.
		applicationServerKey: decode(publicKey) as BufferSource,
	});
	await fetch("/api/me/push", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(renewed.toJSON()),
	});
}
