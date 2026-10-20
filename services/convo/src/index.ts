import { WorkerEntrypoint } from "cloudflare:workers";
import type { ThreadMessage } from "@cdl/contracts";

export interface Env {
	DB: D1Database;
}

const RETENTION_DAYS = 90;
const now = () => Math.floor(Date.now() / 1000);

/**
 * Messages between the two parties of a loan. Nothing here knows who the
 * parties are or what the book is — core checks that before calling. Swap
 * this for an email relay or a WhatsApp bridge and core does not change
 * (decision 0004, 0013).
 */
export default class Convo extends WorkerEntrypoint<Env> {
	async thread(loanId: string): Promise<ThreadMessage[]> {
		const { results } = await this.env.DB.prepare(
			`SELECT id, loan_id, author_id, body, created_at, via FROM messages
			  WHERE loan_id = ? ORDER BY created_at ASC LIMIT 500`,
		)
			.bind(loanId)
			.all<Row>();
		return results.map(view);
	}

	async post(
		loanId: string,
		authorId: string,
		body: string,
		via: string | null = null,
	): Promise<ThreadMessage> {
		const text = body.trim().slice(0, 1000);
		if (!text) throw new Error("empty message");
		const id = ulid();
		const at = now();
		await this.env.DB.batch([
			this.env.DB.prepare(
				"INSERT OR IGNORE INTO threads (loan_id, created_at) VALUES (?, ?)",
			).bind(loanId, at),
			this.env.DB.prepare(
				"INSERT INTO messages (id, loan_id, author_id, body, created_at, via) VALUES (?, ?, ?, ?, ?, ?)",
			).bind(id, loanId, authorId, text, at, via?.slice(0, 80) ?? null),
		]);
		return { id, loanId, authorId, body: text, createdAt: at, via };
	}

	/**
	 * How many messages each loan has had since a moment, not counting the
	 * reader's own. Core keeps who read what; this only counts.
	 */
	async unread(
		readerId: string,
		loans: { loanId: string; since: number }[],
	): Promise<Record<string, number>> {
		if (loans.length === 0) return {};
		const rows = await this.env.DB.batch(
			loans.map(({ loanId, since }) =>
				this.env.DB.prepare(
					`SELECT ? AS loan_id, count(*) AS n FROM messages
					  WHERE loan_id = ? AND created_at > ? AND author_id != ?`,
				).bind(loanId, loanId, since, readerId),
			),
		);
		const counts: Record<string, number> = {};
		for (const result of rows) {
			const row = (result.results as { loan_id: string; n: number }[])[0];
			if (row?.n) counts[row.loan_id] = row.n;
		}
		return counts;
	}

	/** Everything one member wrote, for a copy of their data. */
	async byAuthor(authorId: string): Promise<ThreadMessage[]> {
		const { results } = await this.env.DB.prepare(
			`SELECT id, loan_id, author_id, body, created_at, via FROM messages
			  WHERE author_id = ? ORDER BY created_at ASC`,
		)
			.bind(authorId)
			.all<Row>();
		return results.map(view);
	}

	/** A member asked to be forgotten: what they wrote goes too. */
	async eraseAuthor(authorId: string): Promise<number> {
		const result = await this.env.DB.prepare(
			"DELETE FROM messages WHERE author_id = ?",
		)
			.bind(authorId)
			.run();
		return result.meta.changes ?? 0;
	}

	/** Core calls this when a loan ends; retention counts from here. */
	async closed(loanId: string, closedAt: number): Promise<void> {
		await this.env.DB.prepare(
			`INSERT INTO threads (loan_id, closed_at, created_at) VALUES (?, ?, ?)
			 ON CONFLICT(loan_id) DO UPDATE SET closed_at = excluded.closed_at`,
		)
			.bind(loanId, closedAt, closedAt)
			.run();
	}

	/** Nightly cron: threads whose loan closed more than the retention window ago. */
	override async scheduled(): Promise<void> {
		const cutoff = now() - RETENTION_DAYS * 86_400;
		await this.env.DB.batch([
			this.env.DB.prepare(
				"DELETE FROM messages WHERE loan_id IN (SELECT loan_id FROM threads WHERE closed_at < ?)",
			).bind(cutoff),
			this.env.DB.prepare("DELETE FROM threads WHERE closed_at < ?").bind(
				cutoff,
			),
		]);
	}

	override async fetch(): Promise<Response> {
		return new Response("convo", { status: 200 });
	}
}

function view(row: Row): ThreadMessage {
	return {
		id: row.id,
		loanId: row.loan_id,
		authorId: row.author_id,
		body: row.body,
		createdAt: row.created_at,
		via: row.via,
	};
}

interface Row {
	id: string;
	loan_id: string;
	author_id: string;
	body: string;
	created_at: number;
	via: string | null;
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid(): string {
	let time = "";
	let remaining = Date.now();
	for (let index = 0; index < 10; index += 1) {
		time = ALPHABET[remaining % 32]! + time;
		remaining = Math.floor(remaining / 32);
	}
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	let random = "";
	for (let index = 0; index < 16; index += 1)
		random += ALPHABET[bytes[index]! % 32];
	return time + random;
}
