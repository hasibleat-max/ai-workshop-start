# Web view
`./skill-atlas serve [--port <port>]`, port 4173 by default: a local page at `http://127.0.0.1:<port>/`.
Listens on **127.0.0.1 only**; *nothing is stored*.
## The page
- A field for the **repository link**: a GitHub URL or a local directory, as for `scan`
- Its **skills**: name, description, path; sorted by **name**, as `scan` prints them
- The selected skill's **SKILL.md**: its link, `also in <paths>` for copies, the whole file as text
- Warnings under the field; an unreachable repository → its message, *in the page*
## API
`GET /api/scan?repo=<link>` → JSON: `repository`, `skills` (each with `link`, `copies`, `text`), `warnings`.
An error → `{ "error": <message> }`, status 400.
