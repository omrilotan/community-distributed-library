import { libraryWords } from "../../lib/library.ts";
import { contactAddress } from "../../lib/operator.ts";
import { appBase } from "../../lib/site.ts";

/**
 * A contact card for the address the library writes from. Tapping it on a
 * phone offers to save the contact, which is what stops the next sign-in
 * link going to junk — a known sender is treated very differently.
 */
export async function GET(): Promise<Response> {
	const from = contactAddress();
	const site = appBase();
	const { name } = await libraryWords("en");
	// vCard text escapes commas, semicolons and backslashes.
	const text = (value: string) => value.replace(/[\\,;]/g, "\\$&");
	// The file is named after the address's own part, which is the library's slug.
	const file = from.split("@")[0] || "library";

	// CRLF line endings: RFC 6350, and Outlook is unforgiving about it.
	const card = [
		"BEGIN:VCARD",
		"VERSION:3.0",
		`N:;${text(name)};;;`,
		`FN:${text(name)}`,
		`ORG:${text(name)}`,
		`EMAIL;TYPE=INTERNET:${from}`,
		`URL:${site}`,
		"NOTE:Sign-in links and loan notices come from this address.",
		"END:VCARD",
		"",
	].join("\r\n");

	return new Response(card, {
		headers: {
			"content-type": "text/vcard; charset=utf-8",
			"content-disposition": `attachment; filename="${file}.vcf"`,
			"cache-control": "public, max-age=3600",
		},
	});
}
