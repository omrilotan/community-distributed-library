import { cookies } from "next/headers";
import type { TagProposal, Vocabulary } from "@cdl/contracts";
import { slugify } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { library } from "../../../lib/library.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { Callout, Empty, PageHead } from "../../ui.tsx";
import { AdminTabs } from "../tabs.tsx";
import { moderatorOrNull } from "../guard.ts";
import { AsyncForms } from "../../async-forms.tsx";
import { dateFormat } from "../../../lib/dates.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => `${t.tagProposals} · ${t.admin}`);

/**
 * Suggestions from members, and the vocabulary they would join. Approving is
 * an edit: the moderator settles the slug and both labels, because a suggestion
 * arrives in one language and the catalogue is read in two.
 */
export default async function AdminTags({
	searchParams,
}: {
	searchParams: Promise<{
		error?: string;
		approved?: string;
		added?: string;
		saved?: string;
		removed?: string;
	}>;
}) {
	const me = await moderatorOrNull();
	const { error, approved, added, saved, removed } = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	// Labels only in the languages the library offers (core fills the other).
	const offers = (await library()).languages;
	if (!me) return <Empty title={t.moderatorsOnly} />;

	const [proposals, vocab] = await Promise.all([
		core<{ proposals: TagProposal[] }>("/v1/admin/tag-proposals"),
		core<Vocabulary>("/v1/tags"),
	]);
	const all = proposals.status === 200 ? proposals.body.proposals : [];
	const pending = all.filter((one) => one.status === "pending");
	const settled = all.filter((one) => one.status !== "pending");
	const vocabulary =
		vocab.status === 200 ? vocab.body : { namespaces: [], tags: [] };
	const when = dateFormat(locale, { dateStyle: "medium" });

	return (
		<main>
			<PageHead title={t.admin} aside={<bdi>{me.community.name}</bdi>} />
			{/* Edits and removals save in the background: many small forms, no reloads. */}
			<AsyncForms
				labels={{
					saving: t.formSaving,
					saved: t.formSaved,
					failed: t.adminActionFailed,
				}}
			/>
			<AdminTabs t={t} current="tags" admin={me.role === "admin"} />
			{error === "exists" ? (
				<Callout tone="warn">{t.tagExists}</Callout>
			) : error ? (
				<Callout tone="warn">{t.adminActionFailed}</Callout>
			) : null}
			{added ? (
				<Callout>
					{t.tagAdded} <code dir="ltr">{added}</code>
				</Callout>
			) : null}
			{saved ? <Callout>{t.tagSaved}</Callout> : null}
			{removed ? <Callout>{t.tagRemoved}</Callout> : null}
			{approved ? (
				<Callout>
					{t.tagApproved} <code dir="ltr">{approved}</code>
				</Callout>
			) : null}

			<h2>{t.tagProposals}</h2>
			{pending.length === 0 ? <Empty title={t.noProposals} /> : null}
			{pending.map((proposal) => {
				const suggestedSlug = slugify(proposal.label);
				const namespaceSlug = proposal.namespace ?? "";
				return (
					<article className="card" key={proposal.id}>
						<div>
							<bdi>
								<strong>{proposal.label}</strong>
							</bdi>
							<div className="muted">
								{proposal.namespace
									? (vocabulary.namespaces.find(
											(one) => one.id === proposal.namespace,
										)?.labels[locale] ?? proposal.namespace)
									: `${t.suggestNewLabel} ${proposal.namespaceLabel ?? ""}`}
								{" · "}
								{t.suggestedBy} <bdi>{proposal.proposedBy.displayName}</bdi>
								{proposal.work ? (
									<>
										{" · "}
										{t.forBook}{" "}
										<a href={`/works/${proposal.work.id}`}>
											<bdi>{proposal.work.title}</bdi>
										</a>
									</>
								) : null}
								{" · "}
								{when.format(proposal.createdAt * 1000)}
							</div>

							<form
								action={`/api/admin/tag-proposals/${proposal.id}`}
								method="post"
								className="approve"
							>
								<input type="hidden" name="action" value="approve" />
								{proposal.namespace ? (
									<input type="hidden" name="namespace" value={namespaceSlug} />
								) : (
									<label>
										{t.newLabelSlug}
										<input
											name="namespace"
											type="text"
											dir="ltr"
											required
											defaultValue={slugify(proposal.namespaceLabel ?? "")}
										/>
									</label>
								)}
								{proposal.namespace ? null : (
									<>
										{offers.includes("en") ? (
											<label>
												{t.tagLabelEn}
												<input
													name="namespaceLabelEn"
													type="text"
													dir="ltr"
													required
												/>
											</label>
										) : null}
										{offers.includes("he") ? (
											<label>
												{t.tagLabelHe}
												<input
													name="namespaceLabelHe"
													type="text"
													dir="rtl"
													required
												/>
											</label>
										) : null}
									</>
								)}
								<label>
									{t.tagSlug}
									<input
										name="value"
										type="text"
										dir="ltr"
										required
										defaultValue={suggestedSlug}
									/>
								</label>
								{offers.includes("en") ? (
									<label>
										{t.tagLabelEn}
										<input
											name="labelEn"
											type="text"
											dir="ltr"
											required
											defaultValue={
												proposal.locale === "en" ? proposal.label : ""
											}
										/>
									</label>
								) : null}
								{offers.includes("he") ? (
									<label>
										{t.tagLabelHe}
										<input
											name="labelHe"
											type="text"
											dir="rtl"
											required
											defaultValue={
												proposal.locale === "he" ? proposal.label : ""
											}
										/>
									</label>
								) : null}
								<div className="actions">
									<button type="submit">{t.approveTag}</button>
								</div>
							</form>

							<form
								action={`/api/admin/tag-proposals/${proposal.id}`}
								method="post"
								className="row"
							>
								<input type="hidden" name="action" value="decline" />
								<input
									name="note"
									type="text"
									dir="auto"
									maxLength={200}
									placeholder={t.declineNote}
								/>
								<button type="submit" className="link">
									{t.declineTag}
								</button>
							</form>
						</div>
					</article>
				);
			})}

			<h2>{t.vocabularyTitle}</h2>

			{/* Adding: into a group that exists, or a new one named here. */}
			<details className="tag-add">
				<summary>{t.tagAdd}</summary>
				<form action="/api/admin/tags" method="post" className="tag-add-form">
					<div className="field">
						<label htmlFor="tag-group">{t.tagGroup}</label>
						<select
							id="tag-group"
							name="namespace"
							defaultValue={
								// Most new tags are genres; a new group is the rare case.
								vocabulary.namespaces.find((n) => n.id === "genre")?.id ??
								vocabulary.namespaces[0]?.id ??
								""
							}
						>
							{vocabulary.namespaces.map((namespace) => (
								<option value={namespace.id} key={namespace.id}>
									{namespace.labels[locale]}
								</option>
							))}
							<option value="">{t.tagNewGroup}</option>
						</select>
					</div>
					{/* Shown only while "A new group" is chosen (CSS :has). */}
					<fieldset className="tag-new-group">
						<legend className="muted">{t.tagNewGroupHint}</legend>
						<div className="tag-fields">
							<div className="field">
								<label htmlFor="tag-group-slug">{t.newLabelSlug}</label>
								<input
									id="tag-group-slug"
									name="newNamespace"
									type="text"
									dir="ltr"
								/>
							</div>
							{offers.includes("en") ? (
								<div className="field">
									<label htmlFor="tag-group-en">{t.tagLabelEn}</label>
									<input
										id="tag-group-en"
										name="namespaceLabelEn"
										type="text"
										dir="ltr"
									/>
								</div>
							) : null}
							{offers.includes("he") ? (
								<div className="field">
									<label htmlFor="tag-group-he">{t.tagLabelHe}</label>
									<input
										id="tag-group-he"
										name="namespaceLabelHe"
										type="text"
										dir="rtl"
									/>
								</div>
							) : null}
						</div>
					</fieldset>
					<div className="tag-fields">
						<div className="field">
							<label htmlFor="tag-value">{t.tagSlug}</label>
							<input
								id="tag-value"
								name="value"
								type="text"
								dir="ltr"
								required
							/>
						</div>
						{offers.includes("en") ? (
							<div className="field">
								<label htmlFor="tag-en">{t.tagLabelEn}</label>
								<input
									id="tag-en"
									name="labelEn"
									type="text"
									dir="ltr"
									required
								/>
							</div>
						) : null}
						{offers.includes("he") ? (
							<div className="field">
								<label htmlFor="tag-he">{t.tagLabelHe}</label>
								<input
									id="tag-he"
									name="labelHe"
									type="text"
									dir="rtl"
									required
								/>
							</div>
						) : null}
					</div>
					<div className="actions">
						<button type="submit">{t.tagAddButton}</button>
					</div>
				</form>
			</details>

			{vocabulary.namespaces.map((namespace) => {
				const inGroup = vocabulary.tags.filter(
					(tag) => tag.namespace === namespace.id,
				);
				return (
					<section className="tag-group" key={namespace.id}>
						<h3>
							{namespace.labels[locale]} <code dir="ltr">{namespace.id}</code>
						</h3>
						<details className="tag-edit">
							<summary className="muted">{t.renameGroup}</summary>
							<form
								data-async=""
								action={`/api/admin/tag-namespaces/${encodeURIComponent(namespace.id)}`}
								method="post"
								className="tag-add-form tag-edit-form"
							>
								<div className="tag-fields">
									{offers.includes("en") ? (
										<div className="field">
											<label htmlFor={`group-en-${namespace.id}`}>
												{t.tagLabelEn}
											</label>
											<input
												id={`group-en-${namespace.id}`}
												name="labelEn"
												type="text"
												dir="ltr"
												required
												defaultValue={namespace.labels.en}
											/>
										</div>
									) : null}
									{offers.includes("he") ? (
										<div className="field">
											<label htmlFor={`group-he-${namespace.id}`}>
												{t.tagLabelHe}
											</label>
											<input
												id={`group-he-${namespace.id}`}
												name="labelHe"
												type="text"
												dir="rtl"
												required
												defaultValue={namespace.labels.he}
											/>
										</div>
									) : null}
								</div>
								<div className="actions">
									<button type="submit" className="secondary">
										{t.save}
									</button>
								</div>
							</form>
						</details>

						<ul className="tag-list">
							{inGroup.map((tag) => {
								const id = tag.slug.replace(/[^a-z0-9]+/g, "-");
								return (
									<li key={tag.slug}>
										<details>
											<summary>
												<span className="chip">
													{tag.labels[locale]}
													{tag.works ? ` · ${tag.works}` : ""}
												</span>
											</summary>
											<form
												data-async=""
												action={`/api/admin/tags/${encodeURIComponent(tag.slug)}`}
												method="post"
												className="tag-add-form tag-edit-form"
											>
												<div className="tag-fields">
													<div className="field">
														<label htmlFor={`value-${id}`}>{t.tagSlug}</label>
														<input
															id={`value-${id}`}
															name="value"
															type="text"
															dir="ltr"
															required
															defaultValue={tag.value}
														/>
													</div>
													{offers.includes("en") ? (
														<div className="field">
															<label htmlFor={`en-${id}`}>{t.tagLabelEn}</label>
															<input
																id={`en-${id}`}
																name="labelEn"
																type="text"
																dir="ltr"
																required
																defaultValue={tag.labels.en}
															/>
														</div>
													) : null}
													{offers.includes("he") ? (
														<div className="field">
															<label htmlFor={`he-${id}`}>{t.tagLabelHe}</label>
															<input
																id={`he-${id}`}
																name="labelHe"
																type="text"
																dir="rtl"
																required
																defaultValue={tag.labels.he}
															/>
														</div>
													) : null}
												</div>
												<div className="actions">
													<button type="submit" className="secondary">
														{t.save}
													</button>
												</div>
											</form>
											{tag.builtin ? (
												<p className="muted">{t.tagBuiltin}</p>
											) : (
												<form
													data-async=""
													action={`/api/admin/tags/${encodeURIComponent(tag.slug)}`}
													method="post"
													className="inline"
												>
													<input type="hidden" name="action" value="remove" />
													<button type="submit" className="link">
														{t.tagRemove}
													</button>{" "}
													<span className="muted">{t.tagRemoveHint}</span>
												</form>
											)}
										</details>
									</li>
								);
							})}
						</ul>
					</section>
				);
			})}

			{settled.length ? (
				<>
					<h2>{t.settledProposals}</h2>
					<table>
						<tbody>
							{settled.map((proposal) => (
								<tr key={proposal.id}>
									<td>
										<bdi>{proposal.label}</bdi>
									</td>
									<td>{proposal.status === "approved" ? "✓" : "✕"}</td>
									<td>
										{proposal.tag ? (
											<code dir="ltr">{proposal.tag}</code>
										) : null}
										{proposal.note ? <bdi>{proposal.note}</bdi> : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			) : null}
		</main>
	);
}
