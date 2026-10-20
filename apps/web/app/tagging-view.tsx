import type { TaggingOnly, TaggingStep, Vocabulary } from "@cdl/contracts";
import type { Locale, Strings } from "../lib/i18n.ts";
import { Empty } from "./ui.tsx";
import { PlainCover } from "./plain-cover.tsx";

/**
 * One book of a tagging queue: its chips in every group, a field per group
 * for a value that is missing, and Save and next / Back / Skip. Moderators
 * walk the community's books (a new value becomes a tag); a member walks
 * their own (a new value goes to the moderators as a suggestion).
 */
export function TaggingView({
	step,
	vocab,
	locale,
	t,
	base,
	action,
	only,
	at,
	hint,
}: {
	step: TaggingStep | null;
	vocab: Vocabulary;
	locale: Locale;
	t: Strings;
	/** The page's own path, for the filter and Back / Skip links. */
	base: string;
	/** Where Save posts. */
	action: string;
	only: TaggingOnly;
	at: number;
	/** What a new value typed into a group will do. */
	hint: string;
}) {
	const body = step;
	const work = step?.work ?? null;
	const chosen = new Set(work?.tags ?? []);
	const href = (to: { at?: number; only?: string }) =>
		`${base}?only=${encodeURIComponent(to.only ?? only)}&at=${to.at ?? at}`;
	// A queue per group a book may lack: language is set on listing, so not it.
	const groups = vocab.namespaces.filter((group) => group.id !== "language");
	const missing = groups.find((group) => only === `missing:${group.id}`);
	return (
		<>
			<p
				className="filter-row tagging-filter"
				role="group"
				aria-label={t.taggingWhich}
			>
				<span className="muted">{t.taggingWhich}</span>
				<span className="filter-chips">
					<a
						className="chip"
						href={href({ only: "untagged", at: 0 })}
						aria-current={only === "untagged" ? "true" : undefined}
					>
						{t.taggingUntagged}
					</a>
					<a
						className="chip"
						href={href({ only: "all", at: 0 })}
						aria-current={only === "all" ? "true" : undefined}
					>
						{t.taggingAll}
					</a>
					{groups.map((group) => (
						<a
							className="chip"
							key={group.id}
							href={href({ only: `missing:${group.id}`, at: 0 })}
							aria-current={only === `missing:${group.id}` ? "true" : undefined}
						>
							{t.taggingMissing(group.labels[locale])}
						</a>
					))}
				</span>
			</p>

			{!work ? (
				<Empty
					title={
						only === "all"
							? t.taggingNone
							: missing
								? t.taggingMissingDone(missing.labels[locale])
								: t.taggingDone
					}
				/>
			) : (
				<form action={action} method="post" className="tagging">
					<input type="hidden" name="workId" value={work.id} />
					<input type="hidden" name="only" value={only} />
					<input type="hidden" name="at" value={at} />

					<header className="tagging-book">
						<a
							href={`/works/${work.id}`}
							className="tagging-cover"
							aria-hidden="true"
							tabIndex={-1}
						>
							{work.coverUrl ? (
								<img alt="" src={work.coverUrl} />
							) : (
								<PlainCover title={work.title} size="thumb" />
							)}
						</a>
						<div>
							<h2>
								<a href={`/works/${work.id}`}>
									<bdi>{work.title}</bdi>
								</a>
							</h2>
							<p className="muted">
								<bdi>{work.authors.join(", ")}</bdi>
							</p>
							<p className="muted">
								{t.taggingPosition(at + 1, body?.total ?? 0)}
							</p>
						</div>
					</header>

					{vocab.namespaces.map((namespace) => {
						const tags = vocab.tags.filter(
							(tag) => tag.namespace === namespace.id,
						);
						return (
							<div className="filter-row" key={namespace.id}>
								<span className="muted">{namespace.labels[locale]}</span>
								<span className="filter-chips">
									{tags.map((tag) => (
										<label className="chip chip-check" key={tag.slug}>
											<input
												type="checkbox"
												name="tags"
												value={tag.slug}
												defaultChecked={chosen.has(tag.slug)}
											/>
											<span>{tag.labels[locale]}</span>
										</label>
									))}
									{namespace.id === "language" ? null : (
										<input
											className="tag-quick-add"
											type="text"
											name={`new:${namespace.id}`}
											dir="auto"
											maxLength={40}
											aria-label={t.taggingNewValue(namespace.labels[locale])}
											placeholder={t.taggingNewValue(namespace.labels[locale])}
										/>
									)}
								</span>
							</div>
						);
					})}

					{/* One row: going back and skipping together, saving on its own. */}
					<div className="tagging-actions">
						<div className="tagging-steps">
							{at > 0 ? (
								<a className="btn secondary" href={href({ at: at - 1 })}>
									{t.taggingBack}
								</a>
							) : (
								<span className="btn secondary" aria-disabled="true">
									{t.taggingBack}
								</span>
							)}
							<a className="btn secondary" href={href({ at: at + 1 })}>
								{t.taggingSkip}
							</a>
						</div>
						<button type="submit">{t.taggingSaveNext}</button>
					</div>
					<p className="muted">{hint}</p>
				</form>
			)}
		</>
	);
}
