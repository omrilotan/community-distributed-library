# @cdl/design

How the library looks, and why. The tokens live in [`tokens.css`](tokens.css); the web app imports
them at the top of `apps/web/app/globals.css`, right after Tailwind, and everything else refers to
them. New here? Read the four words and the principles first. The rest is reference.

## Four words

- **Clean.** One thing per line of sight. Say it once, in plain words, and leave room around it.
- **Calm.** Nothing shouts, blinks or hurries. No alarms for ordinary states like an empty list.
- **Organic.** Green tea on a soft white page, humanist type. A neighbour's bookshelf, not a dashboard.
- **Flat.** Depth comes from tone and hairlines. No shadows, gradients or glass. The one shadow in
  the app lifts the Browse button out of the tab bar.

## Brand

The mark is [`logo.svg`](logo.svg), in Green Tea, `#16a085`. Give it room, keep it on a plain
ground, and never recolour or outline it.

`#16a085` is too light for ordinary text (3:1 on the page), so it is kept for marks: the logo, the
app icons, the installed app's title bar, and the site's name in the header, which is large and
bold, where 3:1 is enough. `--accent`, a deeper shade of the same hue, carries every other word and
button.

A library may choose its own colour in place of the house green. `apps/web/lib/accent.ts` then
restates `--brand`, `--accent`, `--accent-ink` and `--accent-soft` for both schemes, and the icons
are drawn in that colour.

## Principles

- **Phone first.** Design at 390px, then let it breathe. One thumb, one column.
- **Tight, not cramped.** Small gaps between related things, bigger ones between groups.
- **Colour means something.** Green acts or confirms, amber warns, red is only for danger.
  Everything else is ink on paper.
- **Two languages, one layout.** Hebrew and English are equals. Logical properties only; see
  [frontend conventions](frontend-conventions.md).
- **Works without JavaScript.** Filters are links and actions are forms. Scripts only make things
  quicker.
- **Accessible is the floor.** WCAG 2.2 AA in both schemes and both languages.
  `apps/web/e2e/a11y.spec.ts` runs axe over every page in each language. Targets are at least 24px,
  and every focus is visible.
- **Still when asked.** Honour `prefers-reduced-motion`. Motion is a short fade, 150 to 200ms. Only
  a cover travelling between its tile and its page takes longer: a quarter of a second.

## Tokens

| Token                                    | Use                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `--bg`, `--surface`                      | Page, and anything that sits on it (cards, fields)                    |
| `--ink`, `--muted`                       | Text, and secondary text. Nothing lighter than `--muted`              |
| `--line`, `--line-strong`                | Hairlines, and the edge of anything you can type into or press        |
| `--brand`                                | The logo green. Marks, and the header name; never body text           |
| `--accent`, `--accent-soft`              | The one colour that acts; its tint for what is chosen or on           |
| `--accent-ink`                           | Text on `--accent`                                                    |
| `--warn`, `--danger`                     | Needs attention; cannot be undone                                     |
| `--warn-soft`                            | The tint behind a warning                                             |
| `--paper-1` … `--paper-6`                | Plain covers for books without a picture, picked by title             |
| `--radius`, `--radius-sm`                | Containers; controls, fields, chips and small boxes                   |
| `--font`                                 | Heebo, with the system's sans behind it                               |
| `--gutter`, `--header`, `--tabbar-space` | The page's side margin; the header's height; the tab bar's room below |

## Shapes

- Corners are softened, never pills: `--radius` (8px) for containers, `--radius-sm` (5px) for
  anything you press or type into. Only true circles are round (a count, a step number).
- Controls that belong together touch: the search field and its button are one shape.
- Covers are 5:8, with a hairline instead of a shadow. A thing's photos are square.

## Type

- Heebo (`--font`), one face for Hebrew and Latin, self-hosted: no font service sees a visitor, and
  the CSP needs nothing new. The system's sans stands in while it loads.
- Titles in bold (700), small headings semibold (600); text 400, with 500–600 for emphasis,
  buttons and the current tab. No serif, no all-caps.
- Headlines are short and balanced. Body text keeps to a short measure: 58 characters a line at
  most.

## Words

- Say what happens, to a neighbour. "Ask for it", not "Submit request".
- No em-dashes. Short sentences.
- An empty state says what is missing and what to do next.

## Icons

Phosphor only, one weight, imported one icon at a time: `@phosphor-icons/react/dist/ssr/<Name>` in
server components, `@phosphor-icons/react/dist/csr/<Name>` in client components. An icon sits
beside a word; it never replaces one.
