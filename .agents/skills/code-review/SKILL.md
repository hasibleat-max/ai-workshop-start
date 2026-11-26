---
name: code-review
description: Review a change to Skill Atlas against its spec, its tests and AGENTS.md. Use before every commit and pull request, or when asked to review a diff, a branch or a PR.
---

# Code review

The change: what the user names. Otherwise, the branch and the working tree against `main`:
`git diff main...HEAD` and `git diff HEAD`. A pull request: `gh pr diff <number>`.

Review only; change nothing unless the user asks for the fixes.

## 1. Read first

- [AGENTS.md](../../../AGENTS.md), [spec/analysis.md](../../../spec/analysis.md), [spec/cli.md](../../../spec/cli.md).
  The spec decides what is right.
- Each changed file in full, not only its hunks.

## 2. Check

### Spec

- A change in behaviour updates the spec in the same change; a change to the spec changes the code.
- The code does nothing the spec does not say; the spec says nothing the code does not do.

### Tests

- Every case in the spec has an integration test. It runs the command, either `atlas()` from
  `tests/helpers.ts` or the CLI with `spawnSync`, on `./fixture` or on a recorded GitHub answer,
  and checks what it prints.
- A new place a SKILL.md can be gets a fixture file and a row in `fixture/README.md`.
- No test reaches the network: GitHub answers from a `Recording` (`src/core/replay.ts`).
- Where the spec fixes the output, the test asserts it exactly.

### Architecture

- Core is fetch → find → parse (`src/core`); the CLI is a thin client (`src/cli.ts`).
- `src/core`, `src/commands.ts` and `src/browser.ts` serve the browser too: no `node:` imports.
  Node-only code lives in `src/cli.ts`, `src/local.ts` and `src/web.ts`, the local web view's server.
- Nothing is stored: no files written, no cache on disk.
- A failure the user should understand is an `AtlasError`: its message, exit code 1. Any other
  error is a bug.

### Where bugs hide here

- What a project skill is: exactly `<root>/<name>/SKILL.md` from the repository root, `<root>` one
  of `SKILL_ROOTS`; one skill per `<name>`; its link is the first path in sorted order, the others
  its copies.
- Links pin the scanned commit; each path segment is URL-encoded.
- GitHub: code search returns 1000 results at most, a large tree comes back truncated, and 404,
  401 and rate limit each have their own message. `GITHUB_TOKEN` is never printed.
- Output: sorted by name, then path; the description's first sentence; `also in` for copies;
  `1 skill`, not `1 skills`; warnings on stderr only. Malformed front matter is a warning and the
  scan goes on.
- Speed: under 5 s for intellij-community. Read only the project skills' SKILL.md files, and read
  them at the same time.

### Style

- Like the code around it: short comments that say why, plain names, no dead code.

## 3. Run

What CI runs (`.github/workflows/ci.yml`):

```console
$ npm ci              # a fresh checkout only
$ npm run typecheck
$ npm test
$ ./skill-atlas help
$ ./skill-atlas scan ./fixture
```

Each must pass. A failure is a blocking finding.

## 4. Report

- Findings, most severe first: `file:line`, what is wrong, an input that shows it, the fix.
- Severity: **blocking** (a bug, a mismatch with the spec, a missing test, a red check),
  **should fix**, **nit**.
- Only what you checked. If you could not show it, say so.
- Last line: **ready** or **not ready**. Done, per AGENTS.md: CI is green for the final commit.
