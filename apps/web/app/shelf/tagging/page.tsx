import { cookies } from "next/headers";
import { taggingOnly, type TaggingStep } from "@cdl/contracts";
import { core } from "../../../lib/core.ts";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { requireProfile } from "../../../lib/profile.ts";
import { vocabulary } from "../../../lib/vocabulary.ts";
import { Callout, PageHead } from "../../ui.tsx";
import { TaggingView } from "../../tagging-view.tsx";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.myTagging);

/**
 * A member's own books, one at a time, to tag quickly: the same screen the
 * moderators use, over one shelf. A value the vocabulary lacks goes to the
 * moderators as a suggestion for that book.
 */
export default async function MyTaggingPage({
	searchParams,
}: {
	searchParams: Promise<{
		at?: string;
		only?: string;
		error?: string;
		suggested?: string;
	}>;
}) {
	await requireProfile();
	const params = await searchParams;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const only = taggingOnly(params.only);
	const at = Math.max(0, Number(params.at ?? 0) || 0);
	const [step, vocab] = await Promise.all([
		core<TaggingStep>(
			`/v1/me/tagging?only=${encodeURIComponent(only)}&at=${at}`,
		),
		vocabulary(),
	]);

	return (
		<main>
			<PageHead title={t.myTagging} aside={<a href="/shelf">{t.shelf}</a>} />
			{params.error ? (
				<Callout tone="warn">{t.adminActionFailed}</Callout>
			) : null}
			{params.suggested ? <Callout>{t.tagSuggested}</Callout> : null}
			<TaggingView
				step={step.status === 200 ? step.body : null}
				vocab={vocab}
				locale={locale}
				t={t}
				base="/shelf/tagging"
				action="/api/shelf/tagging"
				only={only}
				at={at}
				hint={t.myTaggingHint}
			/>
		</main>
	);
}
