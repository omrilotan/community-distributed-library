import { cookies } from "next/headers";
import type { ContactMessagePage } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { adminOrNull } from "../guard.ts";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled(
	(t) => `${t.adminMessages} · ${t.admin}`,
);

/**
 * Everything written to the library through "Write to the library", newest
 * first, a page at a time. The admin's alone: a complaint may be about a
 * moderator, and a data request is the admin's to answer.
 */
export default async function MessagesPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string; error?: string }>;
}) {
	const me = await adminOrNull();
	const params = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.adminsOnly} />;

	const page = Math.max(1, Number(params.page ?? 1) || 1);
	const list = await core<ContactMessagePage>(`/v1/admin/contact?page=${page}`);
	const body = list.status === 200 ? list.body : null;
	const when = dateFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="messages" admin />
			{params.error ? (
				<Callout tone="warn">{t.adminActionFailed}</Callout>
			) : null}
			<p className="muted">{t.adminMessagesHint}</p>
			{body && body.dataRequests.open ? (
				<Callout tone="warn">
					<strong>{t.dataRequestsOpen}</strong>{" "}
					{t.dataRequestsLine(
						body.dataRequests.open,
						Math.floor(
							(Date.now() / 1000 - (body.dataRequests.oldestAt ?? 0)) / 86_400,
						),
					)}
				</Callout>
			) : null}

			{!body || body.messages.length === 0 ? (
				<Empty title={t.adminMessagesNone} />
			) : (
				<>
					<ol className="messages-log">
						{body.messages.map((message) => (
							<li
								key={message.id}
								className={`card${message.handledAt ? " handled" : ""}`}
							>
								<div>
									<p className="muted">
										<span
											className={`badge${message.topic === "complaint" || message.topic === "data" ? " badge-warn" : ""}`}
										>
											{t.contactTopicName(message.topic)}
										</span>{" "}
										{when.format(message.createdAt * 1000)}
										{" · "}
										{message.member ? (
											<a
												href={`/admin/members/${encodeURIComponent(message.member.id)}`}
											>
												<bdi>{message.member.displayName}</bdi>
											</a>
										) : (
											t.adminMessagesVisitor
										)}{" "}
										<a href={`mailto:${message.email}`} dir="ltr">
											{message.email}
										</a>
									</p>
									<p className="message-body">
										<bdi>{message.body}</bdi>
									</p>
									<form
										action={`/api/admin/contact/${encodeURIComponent(message.id)}`}
										method="post"
										className="inline"
									>
										<input type="hidden" name="page" value={page} />
										<input
											type="hidden"
											name="action"
											value={message.handledAt ? "reopen" : "handled"}
										/>
										{message.handledAt ? (
											<span className="muted">
												{t.adminMessagesHandled(
													when.format(message.handledAt * 1000),
												)}{" "}
											</span>
										) : null}
										<button type="submit" className="link">
											{message.handledAt
												? t.adminMessagesReopen
												: t.adminMessagesMark}
										</button>
									</form>
								</div>
							</li>
						))}
					</ol>
					{body.pages > 1 ? (
						<nav className="pager" aria-label={t.adminMessages}>
							{page > 1 ? (
								<a
									className="btn secondary"
									href={`/admin/messages?page=${page - 1}`}
								>
									{t.newer}
								</a>
							) : null}
							<span className="muted">{t.pageOf(page, body.pages)}</span>
							{page < body.pages ? (
								<a
									className="btn secondary"
									href={`/admin/messages?page=${page + 1}`}
								>
									{t.older}
								</a>
							) : null}
						</nav>
					) : null}
				</>
			)}
		</main>
	);
}
