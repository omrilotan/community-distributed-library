import type {
	Delivery,
	MetadataLookup,
	Message,
	ThreadMessage,
} from "@cdl/contracts";

/**
 * What `core` needs of the metadata service. Declared here rather than imported
 * from that service, so the binding can be swapped for any implementation of
 * the same call (decision 0013).
 */
export interface MetadataService {
	lookup(isbn13: string): Promise<MetadataLookup | null>;
}

/** What `core` needs of the notify service. */
/** What became of a push, by subscription. */
export interface PushOutcome {
	sent: number;
	/** Thrown away by the browser: never to be tried again. */
	gone: string[];
	/** Left out by a notify deployed before they were counted. */
	delivered?: string[];
	failed?: string[];
}

export interface NotifyService {
	send(message: Message): Promise<Delivery>;
	push(
		subscriptions: {
			id: string;
			endpoint: string;
			p256dh: string;
			auth: string;
		}[],
		message: Message,
	): Promise<PushOutcome>;
}

/** What `core` needs of the conversation service. */
export interface ConvoService {
	thread(loanId: string): Promise<ThreadMessage[]>;
	byAuthor(authorId: string): Promise<ThreadMessage[]>;
	eraseAuthor(authorId: string): Promise<number>;
	unread(
		readerId: string,
		loans: { loanId: string; since: number }[],
	): Promise<Record<string, number>>;
	post(
		loanId: string,
		authorId: string,
		body: string,
		via?: string | null,
	): Promise<ThreadMessage>;
	closed(loanId: string, closedAt: number): Promise<void>;
}

export interface Env {
	DB: D1Database;
	METADATA: Fetcher & MetadataService;
	NOTIFY: Fetcher & NotifyService;
	CONVO: Fetcher & ConvoService;
	/** Where magic links and invite links point — the web app's origin. */
	APP_URL: string;
	COVERS: R2Bucket;
	COVERS_PUBLIC_URL: string;
	/** VAPID public key, base64url; handed to browsers at subscribe time. */
	VAPID_PUBLIC_KEY?: string;
	/** Private bucket for nightly database snapshots; absent locally. */
	BACKUPS?: R2Bucket;
	/** Where a member's feedback, data request or complaint is sent. */
	CONTACT_ADDRESS: string;
	DEV_AUTH?: string;
}
