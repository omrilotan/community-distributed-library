import type { Strings } from "./i18n.ts";

/** The words the notifications switch uses, wherever it appears. */
export function pushLabels(t: Strings) {
	return {
		on: t.pushOn,
		off: t.pushOff,
		enable: t.pushEnable,
		disable: t.pushDisable,
		blocked: t.pushBlocked,
		unsupported: t.pushUnsupported,
		hint: t.pushHint,
		test: t.pushTest,
		testSent: t.pushTestSent,
		testFailed: t.pushTestFailed,
		testLimit: t.pushTestLimit,
	};
}
