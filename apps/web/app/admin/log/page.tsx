import { Fragment } from "react";
import { cookies } from "next/headers";
import type { LogPage } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { adminOrNull } from "../guard.ts";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.logTab} · ${t.admin}`);

/**
 * What moderators (and the admin) changed, newest first. The admin's alone:
 * the record of what the people looking after the library did.
 */
export default async function LogPageView({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const me = await adminOrNull();
	const params = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.adminsOnly} />;

	const page = Math.max(1, Number(params.page ?? 1) || 1);
	const log = await core<LogPage>(`/v1/admin/log?page=${page}`);
	const body = log.status === 200 ? log.body : null;
	const when = dateFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="log" admin />
			<p className="muted">{t.logHint}</p>
			{!body || body.entries.length === 0 ? (
				<Empty title={t.logNone} />
			) : (
				<>
					<div className="table-wrap">
						<table className="log">
							<thead>
								<tr>
									<th>{t.logWhen}</th>
									<th>{t.logWho}</th>
									<th>{t.logWhat}</th>
								</tr>
							</thead>
							<tbody>
								{body.entries.map((entry) => (
									<Fragment key={entry.id}>
										<tr>
											<td>{when.format(entry.createdAt * 1000)}</td>
											<td>
												<a
													href={`/admin/members/${encodeURIComponent(entry.actor.id)}`}
												>
													<bdi>{entry.actor.displayName}</bdi>
												</a>
												{entry.via ? (
													<div className="muted">{t.madeVia(entry.via)}</div>
												) : null}
											</td>
											<td>
												{t.logAction(entry.action)}
												{entry.targetName ? (
													<>
														{" · "}
														<a
															href={`/admin/members/${encodeURIComponent(entry.target ?? "")}`}
														>
															<bdi>{entry.targetName}</bdi>
														</a>
													</>
												) : entry.target ? (
													<>
														{" · "}
														<code dir="ltr">{entry.target}</code>
													</>
												) : null}
												{entry.details ? (
													<details className="log-toggle">
														<summary>{t.logDetails}</summary>
													</details>
												) : null}
											</td>
										</tr>
										{/* The details take the row's whole width, under it. Shown
									    while the toggle above is open: CSS, no script. */}
										{entry.details ? (
											<tr className="log-more">
												<td colSpan={3}>
													<pre dir="ltr" className="log-details">
														{readable(entry.details)}
													</pre>
												</td>
											</tr>
										) : null}
									</Fragment>
								))}
							</tbody>
						</table>
					</div>
					{body.pages > 1 ? (
						<nav className="pager" aria-label={t.logTab}>
							{page > 1 ? (
								<a
									className="btn secondary"
									href={`/admin/log?page=${page - 1}`}
								>
									{t.newer}
								</a>
							) : null}
							<span className="muted">{t.pageOf(page, body.pages)}</span>
							{page < body.pages ? (
								<a
									className="btn secondary"
									href={`/admin/log?page=${page + 1}`}
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

/** Details are stored as JSON on one line; indent them to be read. */
function readable(details: string): string {
	try {
		return JSON.stringify(JSON.parse(details), null, 2);
	} catch {
		return details;
	}
}
