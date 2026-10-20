import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { strings, type Locale } from "../../../lib/i18n.ts";
import { titled } from "../../../lib/page-title.ts";

export const generateMetadata = titled((t) => t.signIn);

/**
 * The link in the email lands here. Opening it signs nobody in: Outlook's Safe
 * Links and other scanners fetch every link first, and a one-time token spent
 * on a GET would be gone before the member tapped it. The button spends it.
 */
export default async function SignInCallback({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;
	if (!token) redirect("/login?error=1");
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);

	return (
		<main className="narrow">
			<h1>{t.signIn}</h1>
			<p className="muted">{t.finishSignIn}</p>
			<form
				action="/api/auth/exchange"
				method="post"
				className="finish-sign-in"
			>
				<input type="hidden" name="token" value={token} />
				<button type="submit">{t.signIn}</button>
			</form>
		</main>
	);
}
