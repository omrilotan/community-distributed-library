import type { Page } from "@playwright/test";

/**
 * Keeps what the page copies, so a test can read it back. The pages' own
 * permissions policy turns clipboard reading off, so the test cannot ask the
 * clipboard; it reads what was handed to it instead. Call before `goto`.
 */
export async function watchClipboard(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const write = navigator.clipboard.writeText.bind(navigator.clipboard);
		navigator.clipboard.writeText = (text: string) => {
			(window as unknown as { copied: string }).copied = text;
			return write(text);
		};
	});
}

/** The last text the page copied. */
export function copied(page: Page): Promise<string> {
	return page.evaluate(
		() => (window as unknown as { copied?: string }).copied ?? "",
	);
}
