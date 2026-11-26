# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every project skill: **name**, **description**, **link**.
For copies of the same skill, include all paths.
## What is a project skill?
A project skill is `<root>/<name>/SKILL.md`, relative to the repository root.
`<root>` is one of:
- `.agents/skills`
- `.claude/skills`
- `.github/skills`
- `agent/skills`

The same `<name>` in multiple allowed roots counts as one skill.
`<name>` is the directory. The link: the first path in sorted order (the order above); the others are copies.
Anything else is not a project skill.
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
