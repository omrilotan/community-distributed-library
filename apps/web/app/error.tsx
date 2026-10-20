"use client";

import { useEffect, useState } from "react";

/**
 * Something on our side failed while making the page. Said plainly, in the
 * page's language, with a way to try again. The member's sign-in is not in
 * question here; only 401 sends anyone to the door.
 */
export default function ErrorPage({ reset }: { reset: () => void }) {
	const [he, setHe] = useState(false);
	useEffect(() => {
		setHe(document.documentElement.lang === "he");
	}, []);
	const t = he
		? {
				title: "הספרייה לא עונה כרגע",
				hint: "משהו אצלנו נפל. הכניסה שלכם בסדר; נסו שוב בעוד רגע.",
				again: "לנסות שוב",
				home: "לעמוד הראשי",
			}
		: {
				title: "The library is not answering",
				hint: "Something on our side failed. Your sign-in is fine; try again in a moment.",
				again: "Try again",
				home: "Front page",
			};
	return (
		<main className="narrow" style={{ maxInlineSize: "32rem" }}>
			<h1>{t.title}</h1>
			<p className="muted">{t.hint}</p>
			<p className="actions">
				<button type="button" onClick={() => reset()}>
					{t.again}
				</button>
				<a className="btn secondary" href="/">
					{t.home}
				</a>
			</p>
		</main>
	);
}
