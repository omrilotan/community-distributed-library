/**
 * A form's answer. A plain submit gets a redirect, as a form always has; a
 * form sent in the background (app/async-forms.tsx sets the header) gets the
 * same outcome as JSON, so the page can stay where it is.
 */
export const BACKGROUND_HEADER = "x-cdl-form";

export function formReply(
	request: Request,
	location: string,
	ok: boolean,
): Response {
	if (request.headers.get(BACKGROUND_HEADER) === "background") {
		return Response.json(
			{ ok, location },
			{ status: ok ? 200 : 400, headers: { "cache-control": "no-store" } },
		);
	}
	return new Response(null, { status: 303, headers: { location } });
}
