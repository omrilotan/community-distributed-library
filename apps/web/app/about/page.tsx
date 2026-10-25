import { cookies } from "next/headers";
import { strings, type Locale } from "../../lib/i18n.ts";
import { library, libraryWords } from "../../lib/library.ts";
import { libraryType } from "../../lib/library-type.ts";

/** The page's own words, in the language it opens in. */
export async function generateMetadata() {
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const words = await libraryWords(locale);
	return {
		title: words.name ? `${t.about} · ${words.name}` : t.about,
		description: words.tagline ?? undefined,
	};
}

/**
 * What the library is and how to use it, in about a minute of reading. One
 * lede, the three things people do as a list rather than three identical
 * blocks, the assistant, and the one rule that matters.
 */
export default async function AboutPage() {
	const locale = ((await cookies()).get("locale")?.value ?? "en") as Locale;
	const t = strings(locale);
	const words = await libraryWords(locale);
	const he = locale === "he";

	const things = libraryType() === "things";
	// Where everyone lives close by, there are no areas or distances to speak
	// of; where they spread out, an item shows its owner's rough area.
	const close = (await library()).compact;
	const shown = {
		en: close
			? "It shows up for your neighbours straight away. Your address is shown only to the neighbour you lend to, once you have both agreed on the loan."
			: "It shows up for your neighbours straight away, with your rough area and the distance, never your address.",
		he: (noun: string) =>
			close
				? `${noun} מופיע מיד אצל השכנים. הכתובת שלכם מוצגת רק לשכן/ה שמשאילים לו/ה, ורק אחרי ששניכם הסכמתם על ההשאלה.`
				: `${noun} מופיע מיד אצל השכנים עם האזור המשוער שלכם והמרחק, ולא עם הכתובת.`,
	};
	const copy = things
		? thingsCopy(he, shown)
		: he
			? {
					lede: "ספרייה שכונתית בלי מדף מרכזי. הספרים נשארים אצל הבעלים שלהם; האתר מראה מי מחזיק מה לידכם, ומלווה את ההשאלה מהבקשה ועד ההחזרה. בלי כסף, בלי קנסות, בלי דמי חבר.",
					howTitle: "איך זה עובד",
					steps: [
						[
							"להוסיף ספר",
							`כתבו שם ומחבר, או מסת״ב אם יש. עם מסת״ב, הכריכה והפרטים מגיעים ממאגרי ספרים ציבוריים בלי להקליד; אפשר גם לצלם כריכה משלכם. ${shown.he("הספר")}`,
						],
						[
							"לשאול ספר",
							"חפשו או דפדפו, ובקשו. הבעלים מאשרים, אתם מסכימים על זמן ומקום ונפגשים. כל צד מקבל קוד קצר שמאשר את המסירה. אם הספר מושאל כרגע, אפשר לבקש להיות הבאים בתור, ולפעמים הוא עובר ישירות מהקורא הקודם אליכם.",
						],
						[
							"להשאיל ספר",
							"בקשה מגיעה במייל. אשרו או דחו, קבעו זמן ותנו את הספר. בפרופיל אפשר להגדיר כמה ספרים אתם מוכנים שיהיו בחוץ בו־זמנית; כשמגיעים למכסה, הספרים נשארים בקטלוג אבל אי אפשר לבקש אותם.",
						],
					],
					askTitle: "או פשוט תבקשו",
					ask: "אפשר לחבר את הספרייה לעוזר בינה מלאכותית, כמו Claude או ChatGPT, ואז לכתוב מה רוצים במילים שלכם, בלי טפסים. הוא מחפש בקטלוג, רושם ספרים, מבקש ומשיב לבקשות בשמכם.",
					yoursTitle: "הספרים שלכם",
					yours:
						"כל השאלה היא הסכם בין שני שכנים. האתר רושם אותה ואינו אחראי לספרים עצמם.",
					welcomeTitle: "כל קורא, כל ספר",
					welcome:
						"אין כאן דירוגים, אין ביקורות ואין כוכבים, לא לספרים ולא לאנשים. זה בכוונה. ספר כיס מרופט רצוי כמו מהדורה ראשונה, קורא איטי רצוי כמו קורא מהיר, ואף טעם לא עומד לציון. ספרייה כזו נשענת על אמון בין שכנים, וכל ספר שמושאל הוא כבר מחווה של טוב לב.",
				}
			: {
					lede: "A neighbourhood library with no central shelf. The books stay with the people who own them; the site shows who has what near you and carries a loan from the first ask to the return. No money, no fines, no membership fee.",
					howTitle: "How it works",
					steps: [
						[
							"List a book",
							`Type a title and author, or an ISBN if the book has one. With an ISBN, the cover and details come from public book databases, with no typing; you can photograph your own cover instead. ${shown.en}`,
						],
						[
							"Borrow a book",
							"Search or browse, then ask. The owner agrees, you settle a time and place, and you meet. Each side gets a short code that confirms the handover. If a book is already out you can ask to be next, and sometimes it passes straight from the previous reader to you.",
						],
						[
							"Lend a book",
							"A request arrives by email. Accept or decline, agree a time, hand it over. Your profile sets how many books you are willing to have out at once; at that limit your books stay in the catalogue but cannot be requested.",
						],
					],
					askTitle: "Or just ask",
					ask: "You can connect the library to an AI assistant such as Claude or ChatGPT, and then say what you want in your own words, with no forms. It searches the catalogue, lists books, asks for them and answers requests on your behalf.",
					yoursTitle: "Your books stay yours",
					yours:
						"Every loan is an agreement between two neighbours. The site keeps the record and takes no responsibility for the books themselves.",
					welcomeTitle: "Every reader, every book",
					welcome:
						"There are no ratings here, no reviews and no stars, for books or for people. That is on purpose. A thumbed paperback is as welcome as a first edition, a slow reader as welcome as a quick one, and nobody's taste is up for marks. A library like this runs on trust between neighbours, and every book lent is already a kindness.",
				};

	const open = he
		? {
				title: "קוד פתוח, של כולם",
				body: "התוכנה שמפעילה את הספרייה הזו היא קוד פתוח ונמסרה לנחלת הכלל. אין חברה מאחוריה, אין פרסומות ואין מעקב, ואין כאן שום דבר למכור. כל אחד יכול לקרוא את הקוד ולבדוק מה הוא עושה, לשפר אותו, או לפתוח ספרייה לרחוב שלו, ועוזר בינה מלאכותית יכול להקים אותה בשבילו.",
				code: "הקוד ב־GitHub",
				start: "לפתוח ספרייה משלכם",
			}
		: {
				title: "Open source, and everyone's",
				body: "The software behind this library is open source and in the public domain. There is no company behind it, no advertising and no tracking, and nothing here is for sale. Anyone can read the code and check what it does, make it better, or open a library for their own street, and an AI assistant can set it up for them.",
				code: "The code on GitHub",
				start: "Start your own library",
			};

	return (
		<main className="about">
			<header className="about-head">
				<h1>{t.about}</h1>
				<p className="about-lede">{copy.lede}</p>
				{words.about ? <p className="muted">{words.about}</p> : null}
			</header>

			<section className="about-steps">
				<h2>{copy.howTitle}</h2>
				<ol>
					{copy.steps.map(([title, body]) => (
						<li key={title}>
							<h3>{title}</h3>
							<p>{body}</p>
						</li>
					))}
				</ol>
			</section>

			<section className="about-ask">
				<div>
					<h2>{copy.askTitle}</h2>
					<p>{copy.ask}</p>
					<p>
						<a className="btn secondary" href="/connect">
							{t.connect}
						</a>
					</p>
				</div>
			</section>

			<section className="about-yours">
				<h2>{copy.yoursTitle}</h2>
				<p>
					{copy.yours} <a href="/terms">{t.terms}</a>
				</p>
			</section>

			{/* No stars, no reviews, for books or for people: on purpose. */}
			<section className="about-welcome">
				<h2>{copy.welcomeTitle}</h2>
				<p>{copy.welcome}</p>
			</section>

			{/* Whose software this is: nobody's, and so everybody's. */}
			<section className="about-open">
				<h2>{open.title}</h2>
				<p>{open.body}</p>
				<p>
					<a href={REPOSITORY}>{open.code}</a>
					{" · "}
					<a href={`${FRONT_DOOR}/#open`}>{open.start}</a>
				</p>
			</section>
		</main>
	);
}

const REPOSITORY = "https://github.com/omrilotan/community-distributed-library";
const FRONT_DOOR = "https://community-distributed-library.com";

/** The same page for a library of things. */
function thingsCopy(
	he: boolean,
	shown: { en: string; he: (noun: string) => string },
) {
	return he
		? {
				lede: "ספרייה שכונתית בלי מחסן מרכזי. הדברים נשארים אצל הבעלים שלהם; האתר מראה מי מחזיק מה לידכם, ומלווה את ההשאלה מהבקשה ועד ההחזרה. בלי כסף, בלי קנסות, בלי דמי חבר.",
				howTitle: "איך זה עובד",
				steps: [
					[
						"להוסיף פריט",
						`כתבו מה זה, כמה יש (סט של 12 כיסאות הוא פריט אחד, שאפשר לשאול ממנו חלק), באיזו קטגוריה, ומה כדאי לדעת: יצרן, מה מגיע איתו, מה השואל מביא. אפשר לצלם תמונה. ${shown.he("הפריט")}`,
					],
					[
						"לשאול",
						"חפשו או דפדפו, ובקשו, ומסט בקשו כמה שצריך. הבעלים מאשרים, אתם מסכימים על זמן ומקום ונפגשים. כל צד מקבל קוד קצר שמאשר את המסירה. אם הפריט מושאל כרגע, אפשר לבקש להיות הבאים בתור.",
					],
					[
						"להשאיל",
						"בקשה מגיעה במייל. אשרו או דחו, קבעו זמן ומסרו. בפרופיל אפשר להגדיר כמה דברים אתם מוכנים שיהיו בחוץ בו־זמנית; כשמגיעים למכסה, הפריטים נשארים ברשימה אבל אי אפשר לבקש אותם.",
					],
				],
				askTitle: "או פשוט תבקשו",
				ask: "אפשר לחבר את הספרייה לעוזר בינה מלאכותית, כמו Claude או ChatGPT, ואז לכתוב מה רוצים במילים שלכם, בלי טפסים. הוא מחפש, רושם את מה שיש לכם, מבקש ומשיב לבקשות בשמכם.",
				yoursTitle: "הדברים שלכם",
				yours:
					"כל השאלה היא הסכם בין שני שכנים. האתר רושם אותה ואינו אחראי לדברים עצמם. כלים וציוד עלולים לגרום לפציעה: השאילו רק מה שבטוח, הסבירו מה צריך לדעת, והשתמשו בזהירות.",
				welcomeTitle: "כל שכן, כל דבר",
				welcome:
					"אין כאן דירוגים, אין ביקורות ואין כוכבים, לא לפריטים ולא לאנשים. זה בכוונה. ספרייה כזו נשענת על אמון בין שכנים, וכל השאלה היא כבר מחווה של טוב לב.",
			}
		: {
				lede: "A neighbourhood library with no central shed. Things stay with the people who own them; the site shows who has what near you and carries a loan from the first ask to the return. No money, no fines, no membership fee.",
				howTitle: "How it works",
				steps: [
					[
						"List a thing",
						`Say what it is, how many there are (twelve folding chairs are one item, and neighbours can borrow some of them), its category, and what is worth knowing: the brand, what comes with it, what the borrower brings. Add a photo if you like. ${shown.en}`,
					],
					[
						"Borrow",
						"Search or browse, then ask, and for a set ask for as many as you need. The owner agrees, you settle a time and place, and you meet. Each side gets a short code that confirms the handover. If it is already out you can ask to be next.",
					],
					[
						"Lend",
						"A request arrives by email. Accept or decline, agree a time, hand it over. Your profile sets how many things you are willing to have out at once; at that limit your things stay listed but cannot be asked for.",
					],
				],
				askTitle: "Or just ask",
				ask: "You can connect the library to an AI assistant such as Claude or ChatGPT, and then say what you want in your own words, with no forms. It searches, lists what you own, asks for things and answers requests on your behalf.",
				yoursTitle: "Your things stay yours",
				yours:
					"Every loan is an agreement between two neighbours. The site keeps the record and takes no responsibility for the things themselves. Tools and gear can injure people: lend only what is safe, say what a borrower should know, and use what you borrow with care.",
				welcomeTitle: "Every neighbour, every thing",
				welcome:
					"There are no ratings here, no reviews and no stars, for things or for people. That is on purpose. A library like this runs on trust between neighbours, and every loan is already a kindness.",
			};
}
