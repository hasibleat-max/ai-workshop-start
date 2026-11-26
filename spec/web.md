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
## API
`GET /api/scan?repo=<link>` → JSON: `repository`, `skills` (each with `description`, `summary`,
`link`, `copies`, `text`), `warnings`.
A clear message (an unreachable repository, an empty field) → `{ "error": <message> }`, status 400;
any other error is a bug → status 500. `GET /` is the page; another path → 404, another method → 405.
