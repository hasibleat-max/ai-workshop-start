// spec/web.md, on a real server: the page, and what it shows for ./fixture and for a GitHub repository.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';
import { createWebServer, startWebServer, type WebScan } from '../src/web.ts';
import { EXAMPLE_COMMIT, EXAMPLE, FIXTURE } from './helpers.ts';

const github = replay(EXAMPLE);
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input));
const server = createWebServer({ open });
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => server.close());

const scanned = (repo: string) => fetch(`${base}/api/scan?repo=${encodeURIComponent(repo)}`);

test('the page has a field for the repository link, a list of skills and a place for SKILL.md', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /^text\/html/);
  const html = await page.text();
  assert.match(html, /<input id="repo"[^>]*aria-label="Repository link"/);
  assert.match(html, /<ul id="skills"/);
  assert.match(html, /<section id="skill" aria-label="SKILL.md">/);
});

test('./fixture: the skills sorted by name, each with its link, copies and whole SKILL.md; the warnings', async () => {
  const response = await scanned(FIXTURE);
  assert.equal(response.status, 200);
  const answer = (await response.json()) as WebScan;
  assert.equal(answer.repository.id, 'fixture');
  assert.deepEqual(
    answer.skills.map((skill) => skill.name),
    ['code-style', 'commits', 'pull-requests', 'release-checklist', 'run-tests'],
  );
  const pullRequests = answer.skills.find((skill) => skill.name === 'pull-requests')!;
  assert.equal(pullRequests.path, '.agents/skills/pull-requests/SKILL.md');
  assert.equal(pullRequests.link, `${pathToFileURL(FIXTURE).href}/.agents/skills/pull-requests/SKILL.md`);
  assert.deepEqual(pullRequests.copies, ['.claude/skills/pull-requests/SKILL.md', 'agent/skills/pull-requests/SKILL.md']);
  for (const skill of answer.skills) assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'));
  assert.equal(answer.warnings.length, 1);
  assert.match(answer.warnings[0], /^\.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('a GitHub repository: the link pins the scanned commit; SKILL.md as read at that commit', async () => {
  const answer = (await (await scanned('https://github.com/JetBrains/example')).json()) as WebScan;
  assert.equal(answer.repository.commit, EXAMPLE_COMMIT);
  assert.deepEqual(answer.skills.map(({ name, link, text }) => ({ name, link, text })), [
    {
      name: 'commits',
      link: `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      text: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
    },
  ]);
});

test('unreachable repository or an empty field → its message, status 400', async () => {
  const missing = await scanned(join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { error: string }).error, /^Not a GitHub URL or a readable directory: /);
  const offline = await scanned('https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 400);
  assert.match(((await offline.json()) as { error: string }).error, /^Cannot reach GitHub: /);
  const empty = await fetch(`${base}/api/scan?repo=`);
  assert.equal(empty.status, 400);
});

test('serve listens on 127.0.0.1 and prints the address; a bad port → usage, exit code 1', async () => {
  const printed: string[] = [];
  const errors: string[] = [];
  const context = {
    open,
    print: (text: string) => printed.push(text),
    error: (text: string) => errors.push(text),
    serve: (port: number) => startWebServer({ open, port }),
  };
  assert.equal(await run(['serve', '--port', 'x'], context), 1);
  assert.deepEqual(errors, ['Usage: skill-atlas serve [--port <port>]']);
  assert.equal(await run(['serve', '--port', String((server.address() as AddressInfo).port)], context), 1);
  assert.match(errors[1], /^Port \d+ is in use; try --port <another>$/);
  assert.equal(await run(['serve', '--port', '0'], { ...context, serve: undefined }), 1);
  assert.equal(errors[2], 'serve runs only in the Node CLI');
});

test('the CLI: serve prints the address and the page answers there until stopped', async (t) => {
  const { spawn } = await import('node:child_process');
  const { CLI } = await import('./helpers.ts');
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => child.kill());
  const line = await new Promise<string>((resolve) => child.stdout.once('data', (data: Buffer) => resolve(data.toString())));
  const match = /^Skill Atlas web view: (http:\/\/127\.0\.0\.1:\d+\/)\n$/.exec(line);
  assert.ok(match, line);
  const answer = (await (await fetch(`${match[1]}api/scan?repo=${encodeURIComponent(FIXTURE)}`)).json()) as WebScan;
  assert.equal(answer.skills.length, 5);
});
