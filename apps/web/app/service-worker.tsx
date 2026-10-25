"use client";

import { useEffect } from "react";
import { renewIfStale } from "../lib/push-key.ts";

/**
 * Registers the worker for everyone, not only for those who turn on
 * notifications: on iOS the app has to be installed before push works at
 * all, and the worker is what push arrives through.
 * It also renews a subscription made under an old server key, checked
 * against the key the page came with (null when signed out).
 */
export function ServiceWorker({ publicKey }: { publicKey: string | null }) {
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		navigator.serviceWorker
			.register("/sw.js")
			.then((registration) =>
				"PushManager" in window
					? renewIfStale(registration, publicKey)
					: undefined,
			)
			.catch(() => {
				// A blocked or unsupported registration costs nothing here.
			});
	}, []);
	return null;
}
