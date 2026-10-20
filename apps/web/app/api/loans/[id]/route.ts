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

/** One form per lever; `back` is where the form lives (list or thread). */
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

	const { status } = await core(
		`/v1/loans/${encodeURIComponent(id)}/${action}`,
		{
			method: "POST",
		},
	);
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
