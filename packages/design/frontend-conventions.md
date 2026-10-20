# Frontend conventions

## Direction

One rule: **write CSS in logical properties and let direction do the work.** No direction variables,
no `[dir="rtl"]` override blocks, no mirrored stylesheet. `he` sets `<html lang="he" dir="rtl">`,
`en` sets `dir="ltr"`, and nothing else in the application knows which one is active.

| Do not write                                  | Write                                            |
| --------------------------------------------- | ------------------------------------------------ |
| `margin-left`, `padding-right`                | `margin-inline-start`, `padding-inline-end`      |
| `left`, `right`                               | `inset-inline-start`, `inset-inline-end`         |
| `border-left`, `border-right-width`           | `border-inline-start`, `border-inline-end-width` |
| `text-align: left`                            | `text-align: start`                              |
| `float: left`                                 | `float: inline-start`                            |
| `width`, `height` where the axis follows text | `inline-size`, `block-size`                      |
| `justify-content: flex-start`                 | `justify-content: start`                         |
| `--gutter-left` / `--gutter-right` pairs      | `padding-inline: var(--gutter)`                  |
| `[dir="rtl"] .card { ... }`                   | nothing — the logical property already flipped   |

Shorthands cover both sides in one declaration: `margin-inline`, `padding-block`, `inset-inline`,
`border-inline`.

## The genuine exceptions

Only three kinds of thing stay physical, because they are not tied to text direction:

1. **Gravity and light** — `box-shadow` offsets, gradients meant to read as a light source.
2. **Transforms** — `translateX`, carousels, drawers that slide in. These do not flip on their own;
   negate the value under `:dir(rtl)`.
3. **Direction-encoding icons** — back chevrons, next arrows, progress. Flip with
   `:dir(rtl) .icon-directional { transform: scaleX(-1); }`.

Use the `:dir()` pseudo-class, not `[dir]` attribute selectors, and keep these exceptions to a
handful of named utility classes so they can be counted.

## Mixed script

A Hebrew UI listing an English title, or the reverse, is the normal case here, not an edge case.

- Render user-supplied text — titles, authors, display names, messages, notes — inside `<bdi>`, or
  with `dir="auto"`. Never interpolate it raw into a sentence.
- Inputs that accept either script get `dir="auto"`.
- Punctuation at the boundary of two scripts belongs to the containing element's direction. If it
  looks wrong, the text is not isolated.
- Format numbers, dates, distances, and plurals through `Intl`, with the member's locale. No manual
  string assembly, no hardcoded `km`.

## Enforcement

- Stylelint rejects physical properties that have a logical equivalent (a logical-CSS plugin), so
  the rule is mechanical rather than a review habit.
- A utility framework, if adopted, may only be used through its logical utilities (`ms-`, `me-`,
  `ps-`, `pe-`, `start-`, `end-`). Its `ltr:` / `rtl:` variants are banned by the same reasoning.
- One screenshot test per key screen in each direction, so a physical property that slips through is
  visible rather than theoretical.
