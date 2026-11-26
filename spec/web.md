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
