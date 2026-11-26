// "What is a project skill?" in spec/analysis.md, rule by rule, on what the real command prints:
// for ./fixture, which has a SKILL.md for every case (fixture/README.md), and for a GitHub
// repository whose code search finds a SKILL.md in every kind of place.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { Recording } from '../src/core/replay.ts';
import { atlas, FIXTURE } from './helpers.ts';

type Printed = { name: string; path: string; copies: string[] };

/** The skills a scan printed: each one's name, the path its link points to and its copies' paths. */
function printedSkills(stdout: string, base: string): Printed[] {
  const skills: Printed[] = [];
  for (const line of stdout.split('\n').slice(1)) {
    const skill = skills.at(-1);
    if (skill && line.startsWith(`  ${base}/`)) skill.path = decodeURIComponent(line.slice(base.length + 3));
    else if (skill && line.startsWith('  also in ')) skill.copies = line.slice('  also in '.length).split(', ');
    else skills.push({ name: line.split(' — ')[0], path: '', copies: [] });
  }
  return skills;
}

const fixture = await atlas(['scan', FIXTURE]);
const skills = printedSkills(fixture.stdout, pathToFileURL(FIXTURE).href);
/** Every path the fixture's scan printed, as a skill's link or as a copy. */
const printed = skills.flatMap((skill) => [skill.path, ...skill.copies]);

/** Of these paths, the ones the scan printed: none should be. */
const printedOf = (paths: string[]) => paths.filter((path) => printed.includes(path));

test('a project skill is <root>/<name>/SKILL.md in each root: .agents/skills, .claude/skills, .github/skills, agent/skills', () => {
  assert.equal(fixture.code, 0, fixture.stderr);
  const linked = (name: string) => skills.find((skill) => skill.name === name)?.path;
  assert.equal(linked('release-checklist'), '.agents/skills/release-checklist/SKILL.md');
  assert.equal(linked('commits'), '.claude/skills/commits/SKILL.md');
  assert.equal(linked('code-style'), '.github/skills/code-style/SKILL.md');
  assert.equal(linked('run-tests'), 'agent/skills/run-tests/SKILL.md');
});

test('exactly <root>/<name>/SKILL.md: not a SKILL.md in a root itself, nor one deeper than <name>', () => {
  assert.deepEqual(printedOf(['.claude/skills/SKILL.md', '.claude/skills/group/nested/SKILL.md']), []);
});

test('the roots are relative to the repository root: a root in a subdirectory is not one', () => {
  assert.deepEqual(printedOf(['packages/app/.claude/skills/build/SKILL.md']), []);
});

test('anything else is not a project skill: the repository root, other directories', () => {
  assert.deepEqual(printedOf(['SKILL.md', 'skills/deploy/SKILL.md', 'docs/skills/commits/SKILL.md']), []);
});

test('the same <name> in several roots is one skill: linked once, with the paths of its copies', () => {
  assert.deepEqual(
    skills.filter((skill) => skill.name === 'pull-requests'),
    [
      {
        name: 'pull-requests',
        path: '.agents/skills/pull-requests/SKILL.md',
        copies: ['.claude/skills/pull-requests/SKILL.md', 'agent/skills/pull-requests/SKILL.md'],
      },
    ],
  );
});

test('the same <name> outside the roots is not a copy', () => {
  assert.deepEqual(
    skills.filter((skill) => skill.name === 'commits'),
    [{ name: 'commits', path: '.claude/skills/commits/SKILL.md', copies: [] }],
  );
});

/** The commit GitHub answers for JetBrains/monorepo. */
const MONOREPO_COMMIT = '3f9a2b7c1d4e8f0a6b5c9d2e7f1a3b8c4d6e0f2a';

const COMMITS = '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n';
const RUN_TESTS = '---\nname: run-tests\ndescription: Run the tests the way CI does. Use before every push.\n---\n';

const raw = (path: string, body: string): Recording => ({
  [`https://raw.githubusercontent.com/JetBrains/monorepo/${MONOREPO_COMMIT}/${path}`]: { status: 200, body },
});

/**
 * What GitHub answers for JetBrains/monorepo: code search finds every SKILL.md, wherever it is.
 * Only the project skills can be read, copies included: on GitHub, every file read is a request.
 */
const MONOREPO: Recording = {
  'https://api.github.com/repos/JetBrains/monorepo': {
    status: 200,
    body: { full_name: 'JetBrains/monorepo', default_branch: 'main' },
  },
  'https://api.github.com/repos/JetBrains/monorepo/commits/main': { status: 200, body: { sha: MONOREPO_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/monorepo&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 7,
      items: [
        { path: 'SKILL.md' },
        { path: '.claude/skills/commits/SKILL.md' },
        { path: 'plugins/kotlin/.claude/skills/build/SKILL.md' },
        { path: '.github/skills/SKILL.md' },
        { path: '.github/skills/templates/new-skill/SKILL.md' },
        { path: 'agent/skills/run-tests/SKILL.md' },
        { path: '.agents/skills/commits/SKILL.md' },
      ],
    },
  },
  ...raw('.agents/skills/commits/SKILL.md', COMMITS),
  ...raw('.claude/skills/commits/SKILL.md', COMMITS),
  ...raw('agent/skills/run-tests/SKILL.md', RUN_TESTS),
};

test('on GitHub, of every SKILL.md code search finds, only the project skills, once each, linked at the scanned commit', async () => {
  const monorepo = await atlas(['scan', 'https://github.com/JetBrains/monorepo'], MONOREPO);
  assert.equal(monorepo.code, 0, monorepo.stderr);
  assert.equal(
    monorepo.stdout,
    [
      'JetBrains/monorepo · 2 skills',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/monorepo/blob/${MONOREPO_COMMIT}/.agents/skills/commits/SKILL.md`,
      '  also in .claude/skills/commits/SKILL.md',
      'run-tests — Run the tests the way CI does.',
      `  https://github.com/JetBrains/monorepo/blob/${MONOREPO_COMMIT}/agent/skills/run-tests/SKILL.md`,
    ].join('\n'),
  );
  assert.equal(monorepo.stderr, '');
});
