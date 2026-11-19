import { cookies } from "next/headers";
import type { AdminCopy } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.assets} · ${t.admin}`);

/** Every copy in the community. Moderators can retire one; owners manage their own on the shelf. */
export default async function AdminAssets({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; error?: string; retired?: string }>;
}) {
	const me = await moderatorOrNull();
	const { q, error, retired } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const copies = await core<{ copies: AdminCopy[] }>(
		`/v1/admin/copies${q ? `?q=${encodeURIComponent(q)}` : ""}`,
	);
	const rows = copies.status === 200 ? copies.body.copies : [];
	const when = dateFormat(locale, { dateStyle: "medium" });

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			<AdminTabs t={t} current="assets" admin={me.role === "admin"} />
			{error ? <Callout tone="warn">{t.adminActionFailed}</Callout> : null}
			{retired ? <Callout>{t.assetRetired}</Callout> : null}
			<form
				action="/admin/assets"
				method="get"
				role="search"
				className="search"
			>
				<input
					name="q"
					type="search"
					dir="auto"
					defaultValue={q ?? ""}
					placeholder={t.assetSearch}
					aria-label={t.assetSearch}
				/>
				<button type="submit">{t.search}</button>
			</form>
			{rows.length === 0 ? <Empty title={t.noAssets} /> : null}
			<div
				className="table-wrap"
				tabIndex={0}
				role="region"
				aria-label={t.assets}
			>
				<table>
					<thead>
						<tr>
							<th scope="col">
								<span className="sr-only">{t.photo}</span>
							</th>
							<th scope="col">{t.title}</th>
							<th scope="col">{t.colOwner}</th>
							<th scope="col">{t.colStatus}</th>
							<th scope="col">{t.colLoan}</th>
							<th scope="col">{t.colAdded}</th>
							<th scope="col">
								<span className="sr-only">{t.manage}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((copy) => {
							const available =
								copy.state === "shelved" && copy.lending === "lendable";
							return (
								<tr key={copy.id}>
									<td>
										{copy.coverUrl ? (
											<img
												className="thumb"
												alt=""
												src={copy.coverUrl}
												style={{ inlineSize: "2.25rem" }}
											/>
										) : null}
									</td>
									<td>
										<a href={`/works/${copy.workId}`}>
											<bdi>
												<strong>{copy.title}</strong>
											</bdi>
										</a>
										<div className="muted">
											<bdi>{copy.authors.join(", ")}</bdi>
										</div>
									</td>
									<td>
										{/* Whose it is, and what else they have listed. */}
										<a href={`/?owner=${encodeURIComponent(copy.owner.id)}`}>
											<bdi>{copy.owner.displayName}</bdi>
										</a>
									</td>
									<td>
										<span className={`badge${available ? " badge-ok" : ""}`}>
											{t.availability({
												state: copy.state,
												lending: copy.lending,
												relayAllowed: false,
											})}
										</span>
									</td>
									<td>
										{copy.openLoan ? (
											<>
												{t.loanStatus(copy.openLoan.status)} ·{" "}
												<bdi>{copy.openLoan.borrowerName}</bdi>
											</>
										) : (
											"—"
										)}
									</td>
									<td>{when.format(copy.createdAt * 1000)}</td>
									<td>
										{copy.openLoan ? null : (
											<form
												action={`/api/admin/copies/${copy.id}/retire`}
												method="post"
												className="inline"
											>
												<button type="submit" className="link">
													{t.retire}
												</button>
											</form>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</main>
	);
}
