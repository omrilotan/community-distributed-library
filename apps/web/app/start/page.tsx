import { redirect } from "next/navigation";

/**
 * There used to be a welcome page here, describing the three setup steps
 * before them. It was more to read than the steps themselves, so a new
 * member now starts on step one; an old link lands there too.
 */
export default function StartPage() {
	redirect("/start/setup");
}
