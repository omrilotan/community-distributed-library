import { test as setup } from "@playwright/test";
import { BORROWER, signIn } from "./library.ts";

const stored = "e2e/.auth/borrower.json";

/**
 * Once per run. Sign-in links are rationed to three a quarter of an hour, and
 * that limit is worth keeping honest, so every project shares one session.
 */
setup("sign in", async ({ page, request }) => {
	await signIn(page, request, BORROWER.email);
	await page.context().storageState({ path: stored });
});
