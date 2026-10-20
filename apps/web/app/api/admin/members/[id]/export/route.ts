import { coreRaw } from "../../../../../../lib/core.ts";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "../../../../../../lib/session.ts";

/**
 * A member's data as a file, for a data request. Asked as the signed-in
 * admin; core refuses anybody else and logs that it was taken.
 */
export async function POST(
	_request: Request,
	context: { params: Promise<{ id: string }> },
): Promise<Response> {
	const { id } = await context.params;
	const token = (await cookies()).get(SESSION_COOKIE)?.value;
	if (!token)
		return new Response(null, { status: 303, headers: { location: "/login" } });
	const response = await coreRaw(
		`/v1/admin/members/${encodeURIComponent(id)}/export`,
		{
			method: "POST",
			headers: { authorization: `Bearer ${token}`, accept: "application/json" },
		},
	);
	if (!response.ok) {
		return new Response(null, {
			status: 303,
			headers: {
				location: `/admin/members/${encodeURIComponent(id)}?error=1`,
			},
		});
	}
	return new Response(response.body, {
		headers: {
			"content-type": "application/json; charset=utf-8",
			"content-disposition": `attachment; filename="member-${id}.json"`,
			// Personal data: never kept by a browser or anything in between.
			"cache-control": "no-store",
		},
	});
}
