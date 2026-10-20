import type { Strings } from "../../lib/i18n.ts";

/** How many setup steps there are, and which one this is. */
export const SETUP_STEPS = 3;

export function SetupProgress({ step, t }: { step: number; t: Strings }) {
	return (
		<div className="setup-progress">
			<p className="muted">{t.setupStepOf(step, SETUP_STEPS)}</p>
			<ol aria-hidden="true">
				{Array.from({ length: SETUP_STEPS }, (_, index) => (
					<li key={index} className={index + 1 <= step ? "done" : undefined} />
				))}
			</ol>
		</div>
	);
}
