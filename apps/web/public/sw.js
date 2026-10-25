/**
 * The service worker exists for notifications, not for offline: the catalogue
 * changes under you and a stale shelf would be worse than no shelf.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim()),
);

// No fetch handler: nothing is cached, and an empty one only made Safari and
// Firefox start the worker for every page and every file before the network
// answered. Browsers offer to install the app from its manifest alone.

self.addEventListener("push", (event) => {
	let payload = {};
	try {
		payload = event.data ? event.data.json() : {};
	} catch {
		payload = {};
	}
	const title = payload.title || "Community Library";
	event.waitUntil(
		self.registration.showNotification(title, {
			body: payload.body || "",
			// One notification per kind: a second request replaces the first
			// rather than stacking up.
			tag: payload.tag || "library",
			data: { url: payload.url || "/" },
			icon: "/icon-192.png",
			badge: "/favicon.svg",
			dir: "auto",
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/";
	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((windows) => {
				// Reuse a window that is already open rather than piling up tabs.
				for (const client of windows) {
					if ("focus" in client) {
						if ("navigate" in client) client.navigate(url);
						return client.focus();
					}
				}
				return self.clients.openWindow(url);
			}),
	);
});
