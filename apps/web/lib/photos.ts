import type { CoverUploadResponse } from "@cdl/contracts";
import { core } from "./core.ts";

/**
 * Store each photo a form sent through the same /v1/covers endpoint any
 * client uses, in order, up to `max`. Null when one of them is refused.
 */
export async function uploadPhotos(
	files: FormDataEntryValue[],
	max: number,
): Promise<string[] | null> {
	const urls: string[] = [];
	for (const file of files) {
		if (!(file instanceof File) || file.size === 0) continue;
		if (urls.length >= max) break;
		const upload = new FormData();
		upload.set("file", file, file.name);
		const stored = await core<CoverUploadResponse>("/v1/covers", {
			method: "POST",
			body: upload,
		});
		if (stored.status !== 201) return null;
		urls.push(stored.body.coverUrl);
	}
	return urls;
}
