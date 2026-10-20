// Stand-ins for the sibling workers, one script for all three bindings.
import { WorkerEntrypoint } from "cloudflare:workers";

/**
 * What convo would keep. Loans are fresh ULIDs in every test, so nothing
 * bleeds between them and there is nothing to reset.
 */
const threads = new Map();

/** Every message core handed to notify, in order. */
const sent = [];

/** Loans whose threads core said were closed, and when. */
const closedThreads = new Map();

export default class Stub extends WorkerEntrypoint {
	fetch() {
		return new Response("stub");
	}
	/** metadata */
	lookup(isbn13) {
		if (isbn13 === "9780000000002") {
			return {
				isbn13,
				title: "Stub Book",
				authors: ["A. Stub"],
				publisher: null,
				publishedYear: null,
				language: "en",
				pageCount: null,
				coverUrl: null,
			};
		}
		// A provider that hands back a cover on its own server, as they all do.
		if (isbn13 === "9780000000019") {
			return {
				isbn13,
				title: "Stub Book With A Cover",
				authors: ["A. Stub"],
				publisher: null,
				publishedYear: null,
				language: "en",
				pageCount: null,
				coverUrl: "https://covers.ok/b/id/1-M.jpg",
			};
		}
		return null;
	}
	/** notify. An address at down.example stands for an email service that is failing. */
	send(message) {
		sent.push(message);
		if (String(message.to).endsWith("@down.example"))
			return { delivered: false, channel: "email", retry: true };
		return { delivered: true, channel: "console" };
	}
	/** What notify was asked to send, for tests to read back. */
	sentMessages() {
		return sent;
	}
	/** notify. An endpoint ending in /refusing stands for a push service that says no. */
	push(subscriptions) {
		const refusing = (one) => one.endpoint.endsWith("/refusing");
		const delivered = subscriptions.filter((one) => !refusing(one));
		return {
			sent: delivered.length,
			gone: [],
			delivered: delivered.map((one) => one.id),
			failed: subscriptions.filter(refusing).map((one) => one.id),
		};
	}
	/** convo */
	thread(loanId) {
		return threads.get(loanId) ?? [];
	}
	post(loanId, authorId, body, via = null) {
		const message = {
			id: `01J0MSG${String(threads.size).padStart(19, "0")}`,
			loanId,
			authorId,
			body,
			via,
			createdAt: Math.floor(Date.now() / 1000),
		};
		threads.set(loanId, [...(threads.get(loanId) ?? []), message]);
		return message;
	}
	byAuthor(authorId) {
		return [...threads.values()].flat().filter((m) => m.authorId === authorId);
	}
	eraseAuthor(authorId) {
		let n = 0;
		for (const [loanId, list] of threads) {
			const kept = list.filter((m) => m.authorId !== authorId);
			n += list.length - kept.length;
			threads.set(loanId, kept);
		}
		return n;
	}
	unread(readerId, loans) {
		const counts = {};
		for (const { loanId, since } of loans) {
			const n = (threads.get(loanId) ?? []).filter(
				(message) => message.createdAt > since && message.authorId !== readerId,
			).length;
			if (n) counts[loanId] = n;
		}
		return counts;
	}
	closed(loanId, at) {
		closedThreads.set(loanId, at);
	}
	/** When core closed a loan's thread, for tests to read back. */
	closedAt(loanId) {
		return closedThreads.get(loanId) ?? null;
	}
}
