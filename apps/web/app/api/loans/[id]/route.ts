import { core } from "../../../../lib/core.ts";
import { safePath } from "../../../../lib/safe-path.ts";

const ACTIONS = new Set([
	"accept",
	"decline",
	"cancel",
	"handed",
	"returned",
	"nudge",
	"extend",
]);

/**
 * One form per lever; `back` is where the form lives (list or thread), and
 * `also` names the other loans the lever moves with this one.
 */
export async function POST(
	request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const form = await request.formData();
	const action = String(form.get("action") ?? "");
	if (!ACTIONS.has(action)) return new Response("bad action", { status: 400 });
	const back = safePath(form.get("back"), "/loans");
	const target = back.startsWith("/loans") ? back : "/loans";

	// The other loans with the same person, moved in the same tap. Core
	// checks each; one it cannot move stays as it was.
	const also = form
		.getAll("also")
		.map(String)
		.filter((other) => /^[0-9A-Z]{26}$/.test(other) && other !== id);
	const path = (loan: string) =>
		`/v1/loans/${encodeURIComponent(loan)}/${action}`;
	// Accepting, declining and handing over move a group in one call: one
	// email, one due date. The rest go one by one.
	const together = ["accept", "decline", "handed"].includes(action);
	const { status } = await core(path(id), {
		method: "POST",
		...(together && also.length ? { body: JSON.stringify({ also }) } : {}),
	});
	if (!together && status === 204)
		for (const other of also) await core(path(other), { method: "POST" });
	const flag =
		status === 401
			? null
			: status === 204
				? action === "nudge"
					? "nudged=1"
					: action === "extend"
						? "extended=1"
						: ""
				: status === 429
					? "error=nudged"
					: status === 409 && action === "extend"
						? "error=waiting"
						: "error=1";
	const location =
		flag === null ? "/login" : flag ? `${target}?${flag}` : target;
	return new Response(null, { status: 303, headers: { location } });
}
