# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `agent/skills/run-tests` | a skill in the fourth root |
| `.agents/skills/pull-requests`, `.claude/skills/pull-requests`, `agent/skills/pull-requests` | copies: one skill |
| `SKILL.md` | not a project skill: at the repository root |
| `.claude/skills/SKILL.md` | not a project skill: in a root, without a `<name>` directory |
| `.claude/skills/group/nested` | not a project skill: deeper than `<root>/<name>` |
| `packages/app/.claude/skills/build` | not a project skill: a root, but not at the repository root |
| `skills/deploy` | not a project skill: not an allowed root |
| `docs/skills/commits` | not a project skill, nor a copy of `commits`: not an allowed root |
