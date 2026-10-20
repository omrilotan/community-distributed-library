import type { Strings } from "../../lib/i18n.ts";
import { Callout } from "../ui.tsx";

/**
 * A member with no times on their grid cannot be met halfway. Said where it
 * matters: when a request arrives, and beside the time table.
 */
export function AvailabilityNudge({ t }: { t: Strings }) {
	return (
		<Callout>
			{t.availabilityNudge}{" "}
			<a href="/settings#availability">{t.setAvailability}</a>
		</Callout>
	);
}
