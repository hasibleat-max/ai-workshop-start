# Web view
`./skill-atlas serve [--port <port>]`, port 4173 by default: a local page at `http://127.0.0.1:<port>/`.
Listens on **127.0.0.1 only**, and answers only `Host: 127.0.0.1:<port>` or `localhost:<port>`
(anything else → 403: no DNS rebinding); *nothing is stored*.
## The page
- A field for the **repository link**: a GitHub URL or a local directory, as for `scan`
- Its **skills**: name, the description's *first sentence*, path; sorted by **name**, as `scan` prints them
- The selected skill's **SKILL.md**: its link, `also in <paths>` for copies, the whole file as text.
  A local directory's skill shows its path as text: an `http://` page cannot open a `file://` link
- Warnings under the field; an unreachable repository → its message, *in the page*
- The status: `<repository> · <n> skills` (`1 skill`)
- A **filter** field above the skills: disabled until a scan finds skills; a new scan clears it
  - As you type, only the skills whose name, path (not its copies') or SKILL.md text contains the filter, ignoring
    case and the spaces around it; still sorted by name. It filters what `/api/scan` returned: nothing is fetched
  - The status: `<repository> · <n> of <total> skills` (`1 of 1 skill`); an empty filter → every skill, the status as above
  - The **counter**, at the right end of the filter field while the filter has text: `<n> of <total>`, the status's
    numbers (skills shown, not matches). An empty filter (or only spaces) → no counter; a new scan clears the filter,
    so the counter goes too. It updates as you type; small and muted, like the paths. The typed text and the field's
    clear button never run under it. Not announced (`aria-hidden="true"`): screen readers hear the count from the
    status (`role="status"`)
  - Under each skill shown, **what it found**: the first line of its SKILL.md that has the filter, trimmed,
    each match in it marked (`<mark>`). No line when the SKILL.md does not have it (a match in the path only)
  - The SKILL.md pane keeps the selected skill if it still matches, else shows the first skill shown;
    every match in its text is marked
  - No match → no skills, none selected, and `No skills match "<filter>".` in the pane
  - *Nothing is stored*: the filter is not in the URL, nor in the browser's storage or form history
## API
`GET /api/scan?repo=<link>` → JSON: `repository`, `skills` (each with `description`, `summary`,
`link`, `copies`, `text`), `warnings`.
A clear message (an unreachable repository, an empty field) → `{ "error": <message> }`, status 400;
any other error is a bug → status 500. `GET /` is the page; another path → 404, another method → 405.
## The look
A modern developer tool: calm, one accent, light and dark. The page's look only; what it does and says stays as above.
- **Palette**, custom properties on `:root`, light by default and dark under `prefers-color-scheme: dark`
  (`color-scheme: light dark`), the same names in both:

  | Property | Light | Dark | For |
  | --- | --- | --- | --- |
  | `--bg` | `#ffffff` | `#0d1117` | the page, the SKILL.md pane, the fields |
  | `--surface` | `#f6f8fa` | `#151b23` | the header, the list's column, the SKILL.md text, a disabled field or button |
  | `--hover` | `#eaeef2` | `#212830` | the skill under the pointer |
  | `--selected` | `#ddf4ff` | `#14263d` | the selected skill, with a bar of `--accent` at its left |
  | `--text` | `#1f2328` | `#e6edf3` | text, skill names |
  | `--muted` | `#59636e` | `#9198a1` | descriptions, paths, the status, the counter, placeholders, what is disabled |
  | `--border` | `#818b98` | `#656c76` | the fields' borders (`--muted` under the pointer), the rules, the spinner's track |
  | `--accent` | `#0969da` | `#4493f8` | the one accent: the Scan button, links, focus rings, the spinner, the square before the page's name |
  | `--accent-hover` | `#0858b9` | `#6cb6ff` | the Scan button under the pointer |
  | `--on-accent` | `#ffffff` | `#0d1117` | the Scan button's text |
  | `--mark` / `--on-mark` | `#fff1a8` / `#1f2328` | `#e3b341` / `#0d1117` | `<mark>`: what the filter found |
  | `--warning` / `--warning-bg` | `#7d4e00` / `#fff8c5` | `#e3b341` / `#272115` | warnings |
  | `--danger` / `--danger-bg` | `#c11d29` / `#ffebe9` | `#ff7b72` / `#2d1416` | an error |
- **Contrast**, in light and in dark: every text color on its background at least 4.5:1 (WCAG AA): `--text` and
  `--muted` on `--bg`, `--surface`, `--hover` and `--selected`; `--accent` on `--bg`; `--on-accent` on `--accent` and
  `--accent-hover`; `--on-mark` on `--mark`; `--warning` and `--danger` on their backgrounds. `--border` on `--bg` and
  `--surface`, and `--accent` on every background a focus ring is on, at least 3:1
- **Type**: the system's sans-serif (`system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`);
  monospace (`ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`) only for the SKILL.md text and
  what the filter found. Sizes 12, 13, 14, 16 and 20 px: skill names 14 px semibold in `--text`, descriptions 13 px and
  paths 12 px in `--muted`. Spacing in multiples of 4 px; corners 6 px, 8 px for the SKILL.md text and
  the empty pane's outline, 2–4 px on small details; no prompts, brackets or
  generated text: the texts are the page's own
- **States**: hover (`--hover`, the button `--accent-hover`); focus, a 2px `--accent` outline on every field, button,
  skill and link; selected (`--selected` and its bar); disabled (`--muted` on `--surface`, no pointer); the empty
  pane, centered and muted under a dashed outline; warnings and an error, each a box in its own colors; a scan in
  progress, a small spinner before the status, from CSS (`#status.busy::before`), so the status's text stays
- **Narrow windows**, under 720 px wide: the list above the SKILL.md pane, at most half the window high, and the page
  scrolls
- **Motion**: transitions of 150 ms on colors and shadows, the spinner turning. With `prefers-reduced-motion: reduce`,
  nothing moves: no animation, no transition
- **Nothing from outside**: system fonts only; no fonts, images or stylesheets from the network (no `<link>`, `@import`
  or `url(http…)`); everything is in the page, which works offline
