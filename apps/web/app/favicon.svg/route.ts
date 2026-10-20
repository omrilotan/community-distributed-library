import { icon } from "../../lib/icon-response.ts";

/** Drawn in the library's colour: lib/icon.ts. */
export function GET(request: Request): Promise<Response> {
	return icon("favicon.svg", request);
}
