import { cookies } from "next/headers";
import type { HandoffView, MyLoans } from "@cdl/contracts";
import { core } from "../../../../../lib/core.ts";
import { icsFile } from "../../../../../lib/calendar.ts";
import { handoffEvent } from "../../../../../lib/handoff-event.ts";
import { strings, type Locale } from "../../../../../lib/i18n.ts";

/**
 * The loan's handoff as an .ics file, for Apple Calendar, Outlook and any
 * calendar that is not Google's. Only for a party to the loan: it asks core
 * as the signed-in member, like the page does.
 */
export async function GET(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const [mine, handoffRes] = await Promise.all([
		core<MyLoans>("/v1/me/loans"),
		core<{ handoff: HandoffView | null }>(
			`/v1/loans/${encodeURIComponent(id)}/handoff`,
		),
	]);
	if (mine.status === 401) {
		return new Response(null, { status: 303, headers: { location: "/login" } });
	}
	const loans =
		mine.status === 200
			? [...mine.body.borrowing, ...mine.body.lending, ...mine.body.relaying]
			: [];
	const loan = loans.find((entry) => entry.id === id);
	const handoff = handoffRes.status === 200 ? handoffRes.body.handoff : null;
	if (!loan || !handoff || !["proposed", "agreed"].includes(handoff.status)) {
		return new Response("Nothing to add to a calendar", { status: 404 });
	}
	// The reader handing a relay on hosts it, as the owner otherwise would.
	const side =
		mine.status === 200 &&
		[...mine.body.lending, ...mine.body.relaying].some(
			(entry) => entry.id === id,
		)
			? "lender"
			: "borrower";
	const event = handoffEvent(loan, handoff, side, strings(locale));
	return new Response(icsFile(event), {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			"content-disposition": `attachment; filename="handoff-${loan.id}.ics"`,
			"cache-control": "private, no-store",
		},
	});
}
