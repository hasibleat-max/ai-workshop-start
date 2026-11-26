// Runs the commands the way the CLI does, with GitHub answering from a recording: EXAMPLE below by default.
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
export const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
  },
};

/** JetBrains/abbreviations: descriptions whose first sentence has an abbreviation in it (issue #7). */
export const ABBREVIATIONS: Recording = {
  'https://api.github.com/repos/JetBrains/abbreviations': { status: 200, body: { full_name: 'JetBrains/abbreviations', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/abbreviations/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/abbreviations&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 3,
      items: [{ path: '.claude/skills/a/SKILL.md' }, { path: '.claude/skills/b/SKILL.md' }, { path: '.claude/skills/c/SKILL.md' }],
    },
  },
  [`https://raw.githubusercontent.com/JetBrains/abbreviations/${EXAMPLE_COMMIT}/.claude/skills/a/SKILL.md`]: {
    status: 200,
    body: '---\nname: a\ndescription: Use e.g. for this. Second.\n---\n',
  },
  [`https://raw.githubusercontent.com/JetBrains/abbreviations/${EXAMPLE_COMMIT}/.claude/skills/b/SKILL.md`]: {
    status: 200,
    body: '---\nname: b\ndescription: Build tools, i.e. Gradle or Maven. Second.\n---\n',
  },
  [`https://raw.githubusercontent.com/JetBrains/abbreviations/${EXAMPLE_COMMIT}/.claude/skills/c/SKILL.md`]: {
    status: 200,
    body: '---\nname: c\ndescription: Run the build tool (e.g. Gradle). Second.\n---\n',
  },
};

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from the recording, EXAMPLE by default. */
export async function atlas(args: string[], recording: Recording = EXAMPLE) {
  const github = replay(recording);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    // With a token, through code search, as EXAMPLE answers it.
    open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input)),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
