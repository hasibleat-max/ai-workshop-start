# Skill Atlas

Every project skill in a repository: `./skill-atlas scan` finds each `<root>/<name>/SKILL.md` in
`.agents/skills`, `.claude/skills`, `.github/skills` or `agent/skills` and prints its name, description
and link, once for all its copies.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas serve` opens a local web view at http://127.0.0.1:4173/ (`--port <port>` for another):
a field for the repository link, its skills, and each one's SKILL.md.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
