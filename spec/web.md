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
A retro CRT terminal, green phosphor on black: the page's look only; what it does and says stays as above.
- **Palette**, custom properties on `:root`, dark only (`color-scheme: dark`): `--bg` `#0a0f0a` (the page),
  `--fg` `#33ff66` (text; the selected skill's background), `--dim` `#1fa84a` (paths, descriptions, the status,
  the counter, placeholders), `--line` `#1f7a3a` (borders and rules), `--hover` `#0f2a17` (the skill under the pointer),
  `--amber` `#ffb000` (warnings; `<mark>`: `--bg` on `--amber`), `--red` `#ff5555` (errors), `--inverse-dim` `#0a3d1a`
  (the selected skill's description and path)
- **Contrast**: every text color on its background at least 4.5:1 (WCAG AA), borders at least 3:1. The selected skill
  is in inverse video: `--bg` on `--fg`
- **Type**: monospace everywhere, from the system (`ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`).
  The heading shows `SKILL ATLAS`, the button `[ SCAN ]` (inverse video on hover and focus), a `>` prompt stands before
  each field, and a block cursor `█` blinks at the end of the status while a scan runs: all from CSS, so the texts stay
  `Skill Atlas`, `Scan` and the status's own
- **The CRT**: faint scanlines from a fixed overlay that takes no clicks, a soft glow on the text in its own color; no flicker
- **Focus**: a 2px `--fg` outline on every field, button and skill
- **Reduced motion** (`prefers-reduced-motion: reduce`): nothing blinks or moves
- **Nothing from outside**: no fonts, images or stylesheets from the network (no `<link>`, `@import` or `url(http…)`);
  everything is in the page, which works offline
