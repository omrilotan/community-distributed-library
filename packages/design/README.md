# @cdl/design

How the library looks, and why. The tokens are in [`tokens.css`](tokens.css); the web app imports
them first thing in `apps/web/app/globals.css`.

## Four words

- **Clean.** One thing per line of sight. Say it once, in plain words, and leave room around it.
- **Calm.** Nothing shouts, blinks or hurries. No alarms for ordinary states like an empty list.
- **Organic.** Green tea on a soft white page, humanist type. A neighbour's bookshelf, not a dashboard.
- **Flat.** Depth comes from tone and hairlines. No shadows, gradients or glass.

## Brand

The mark is [`logo.svg`](logo.svg), in Green Tea, `#16a085`. Give it room, keep it on a plain
ground, and never recolour or outline it. `#16a085` is too light for ordinary text (3:1 on the page),
so it is used for marks (the logo, the app icons, the installed app's title bar) and for the site's
name in the header, which is large and bold, where 3:1 is enough. `--accent`, a deeper shade of the
same hue, carries every other word and button.

## Principles

- **Phone first.** Design at 390px, then let it breathe. One thumb, one column.
- **Tight, not cramped.** Small gaps between related things, bigger ones between groups.
- **Colour means something.** Green acts or confirms, amber warns, red is only for danger.
  Everything else is ink on paper.
- **Two languages, one layout.** Hebrew and English are equals. Logical properties only; see
  [frontend conventions](frontend-conventions.md).
- **Works without JavaScript.** Filters are links and actions are forms. Scripts only make things
  quicker.
- **Accessible is the floor.** WCAG 2.2 AA in both schemes and both languages, checked by
  `apps/web/e2e/a11y.spec.ts`. Targets are at least 24px, and every focus is visible.
- **Still when asked.** Honour `prefers-reduced-motion`. Motion is a 150ms fade at most.

## Tokens

| Token                       | Use                                                            |
| --------------------------- | -------------------------------------------------------------- |
| `--bg`, `--surface`         | Page, and anything that sits on it (cards, fields)             |
| `--ink`, `--muted`          | Text, and secondary text. Nothing lighter than `--muted`       |
| `--line`, `--line-strong`   | Hairlines, and the edge of anything you can type into or press |
| `--brand`                   | The logo green. Marks, and the header name; never body text    |
| `--accent`, `--accent-soft` | The one colour that acts; its tint for what is chosen or on    |
| `--warn`, `--danger`        | Needs attention; cannot be undone                              |
| `--paper-1` … `--paper-6`   | Plain covers for books without a picture, picked by title      |
| `--radius`, `--radius-sm`   | Containers; controls, fields, chips and small boxes            |

## Shapes

- Corners are softened, never pills: `--radius` (8px) for containers, `--radius-sm` (5px) for
  anything you press or type into. Only true circles are round (a count, a step number).
- Controls that belong together touch: the search field and its button are one shape.
- Covers are 5:8, with a hairline instead of a shadow.

## Type

- Heebo (`--font`), one face for Hebrew and Latin, self-hosted: no font service sees a visitor, and
  the CSP needs nothing new. The system's sans stands in while it loads.
- Titles in bold (700), small headings semibold (600); text 400, with 500–600 for emphasis,
  buttons and the current tab. No serif, no all-caps.
- Headlines are short and balanced. Body text keeps to about 65 characters.

## Words

- Say what happens, to a neighbour. "Ask for it", not "Submit request".
- No em-dashes. Short sentences.
- An empty state says what is missing and what to do next.

## Icons

Phosphor only, one weight, from `@phosphor-icons/react/dist/csr/<Name>`. An icon sits beside a word;
it never replaces one.
