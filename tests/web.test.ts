// spec/web.md, on a real server: the page's own script in a DOM, the API, and the CLI's serve, for
// ./fixture and for a GitHub repository answered from the recording in tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { run, type Context } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay } from '../src/core/replay.ts';
import type { Source } from '../src/core/scan.ts';
import { openDirectory } from '../src/local.ts';
import { createWebServer, startWebServer, type WebScan } from '../src/web.ts';
import { CLI, EXAMPLE, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const github = replay(EXAMPLE);
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input));

/** A server on a free port; closed after the tests. */
async function listen(options = { open }): Promise<string> {
  const server = createWebServer(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  test.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const base = await listen();
const port = new URL(base).port;
const scanned = (repo: string) => fetch(`${base}/api/scan?repo=${encodeURIComponent(repo)}`);

/** The page, its script running in a DOM against the server: what it shows after scanning `repo`. */
async function page(repo: string) {
  const dom = new JSDOM(await (await fetch(`${base}/`)).text(), {
    url: `${base}/`,
    runScripts: 'dangerously',
    beforeParse: (window) => Object.assign(window, { fetch: (url: string) => fetch(new URL(url, base)) }),
  });
  const document = dom.window.document;
  const $ = (id: string) => document.getElementById(id)!;
  ($('repo') as HTMLInputElement).value = repo;
  $('go').click();
  for (const start = Date.now(); ($('go') as HTMLButtonElement).disabled || $('status').textContent!.startsWith('Scanning'); ) {
    if (Date.now() - start > 5000) throw new Error('the page did not finish scanning');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const text = (element: Element) => element.textContent;
  return {
    $,
    status: $('status').textContent,
    error: $('status').className === 'error',
    warnings: [...$('warnings').children].map(text),
    skills: [...$('skills').children].map((item) => [...item.children].map(text)),
    selected: () => [...$('skill').children].map((element) => ({ tag: element.tagName, text: element.textContent, href: element.getAttribute('href') })),
    pick: (index: number) => ($('skills').children[index] as HTMLElement).click(),
  };
}

test('the page: the skills sorted by name, with first sentence and path; the first one selected; warnings under the field', async () => {
  const shown = await page(FIXTURE);
  assert.equal(shown.status, 'fixture · 5 skills');
  assert.equal(shown.error, false);
  assert.deepEqual(shown.skills, [
    ['code-style', "Follow the project's code style.", '.github/skills/code-style/SKILL.md'],
    ['commits', 'Write commit messages the way this repository does.', '.claude/skills/commits/SKILL.md'],
    ['pull-requests', 'Open pull requests the way this repository does.', '.agents/skills/pull-requests/SKILL.md'],
    ['release-checklist', '', '.agents/skills/release-checklist/SKILL.md'],
    ['run-tests', 'Run the tests the way CI does.', 'agent/skills/run-tests/SKILL.md'],
  ]);
  assert.equal(shown.warnings.length, 1);
  assert.match(shown.warnings[0]!, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  assert.equal(shown.$('skills').children[0].getAttribute('aria-selected'), 'true');
});

test('the page: the picked skill, its path as text for a local directory, also in its copies, the whole SKILL.md', async () => {
  const shown = await page(FIXTURE);
  shown.pick(2);
  const path = '.agents/skills/pull-requests/SKILL.md';
  assert.deepEqual(shown.selected(), [
    { tag: 'H2', text: 'pull-requests', href: null },
    { tag: 'P', text: path, href: null },
    { tag: 'P', text: 'also in .claude/skills/pull-requests/SKILL.md, agent/skills/pull-requests/SKILL.md', href: null },
    { tag: 'PRE', text: readFileSync(join(FIXTURE, path), 'utf8'), href: null },
  ]);
  assert.equal(shown.$('skills').children[2].getAttribute('aria-selected'), 'true');
  assert.equal(shown.$('skills').children[0].getAttribute('aria-selected'), 'false');
});

test('the page: a GitHub skill links to its SKILL.md at the scanned commit', async () => {
  const shown = await page('https://github.com/JetBrains/example');
  assert.equal(shown.status, 'JetBrains/example · 1 skill');
  const link = `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`;
  assert.deepEqual(shown.selected().slice(0, 2), [
    { tag: 'H2', text: 'commits', href: null },
    { tag: 'A', text: link, href: link },
  ]);
});

test('the page: an unreachable repository → its message in the page, no skills', async () => {
  const shown = await page(join(FIXTURE, 'no-such-directory'));
  assert.equal(shown.error, true);
  assert.match(shown.status!, /^Not a GitHub URL or a readable directory: .*no-such-directory$/);
  assert.deepEqual(shown.skills, []);
});

test('the API: ./fixture, each skill with its description, summary, link, copies and whole SKILL.md; the warnings', async () => {
  const response = await scanned(FIXTURE);
  assert.equal(response.status, 200);
  const answer = (await response.json()) as WebScan;
  assert.equal(answer.repository.id, 'fixture');
  const pullRequests = answer.skills.find((skill) => skill.name === 'pull-requests')!;
  assert.equal(pullRequests.link, `${pathToFileURL(FIXTURE).href}/.agents/skills/pull-requests/SKILL.md`);
  assert.deepEqual(pullRequests.copies, ['.claude/skills/pull-requests/SKILL.md', 'agent/skills/pull-requests/SKILL.md']);
  assert.equal(pullRequests.summary, 'Open pull requests the way this repository does.');
  for (const skill of answer.skills) assert.equal(skill.text, readFileSync(join(FIXTURE, skill.path), 'utf8'));
  assert.equal(answer.warnings.length, 1);
});

test('the API: a GitHub repository, its link pinned to the scanned commit, SKILL.md as read at that commit', async () => {
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

test('the API: a clear message → 400; any other error → 500', async () => {
  const missing = await scanned(join(FIXTURE, 'no-such-directory'));
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { error: string }).error, /^Not a GitHub URL or a readable directory: /);
  const offline = await scanned('https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 400);
  assert.match(((await offline.json()) as { error: string }).error, /^Cannot reach GitHub: /);
  const empty = await fetch(`${base}/api/scan?repo=`);
  assert.equal(empty.status, 400);
  assert.deepEqual(await empty.json(), { error: 'Enter a GitHub repository URL or a directory' });

  const broken = await listen({ open: async (): Promise<Source> => { throw new Error('a bug'); } });
  const bug = await fetch(`${broken}/api/scan?repo=x`);
  assert.equal(bug.status, 500);
  assert.deepEqual(await bug.json(), { error: 'Unexpected error: a bug' });
});

test('another path → 404, another method → 405', async () => {
  assert.equal((await fetch(`${base}/nothing`)).status, 404);
  assert.equal((await fetch(`${base}/api/scan?repo=x`, { method: 'POST' })).status, 405);
});

/** A GET with this Host header: fetch does not let a caller set it. */
function statusFor(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path: `/api/scan?repo=${encodeURIComponent(FIXTURE)}`, headers: { host } }, (response) => {
      response.resume();
      resolve(response.statusCode!);
    }).on('error', reject).end();
  });
}

test('only Host 127.0.0.1:<port> or localhost:<port> → no DNS rebinding', async () => {
  assert.equal(await statusFor(`127.0.0.1:${port}`), 200);
  assert.equal(await statusFor(`localhost:${port}`), 200);
  assert.equal(await statusFor(`evil.example:${port}`), 403);
  assert.equal(await statusFor('localhost:1'), 403);
});

function serveContext(): Context & { printed: string[]; errors: string[] } {
  const printed: string[] = [];
  const errors: string[] = [];
  return {
    printed,
    errors,
    open,
    print: (text) => printed.push(text),
    error: (text) => errors.push(text),
    serve: (port) => startWebServer({ open, port }),
  };
}

test('serve: port 4173 by default; prints the address', async () => {
  const context = serveContext();
  assert.equal(await run(['serve'], { ...context, serve: async (port) => `http://127.0.0.1:${port}/` }), 0);
  assert.deepEqual(context.printed, ['Skill Atlas web view: http://127.0.0.1:4173/']);
});

test('serve: a bad port → usage, a port in use → a message; exit code 1', async () => {
  const context = serveContext();
  assert.equal(await run(['serve', '--port', 'x'], context), 1);
  assert.equal(await run(['serve', '--port', port], context), 1);
  assert.equal(await run(['serve', '--port', '0'], { ...context, serve: undefined }), 1);
  assert.deepEqual(context.errors, [
    'Usage: skill-atlas serve [--port <port>]',
    `Port ${port} is in use; try --port <another>`,
    'serve runs only in the Node CLI',
  ]);
});

test('the CLI: serve prints the address and the page answers there until stopped', async (t) => {
  const child = spawn(process.execPath, [CLI, 'serve', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  // Fails, not hangs, if the server never starts.
  const line = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serve printed nothing in 5 s')), 5000);
    child.stdout.once('data', (data: Buffer) => (clearTimeout(timer), resolve(data.toString())));
    child.once('exit', (code) => (clearTimeout(timer), reject(new Error(`serve exited with ${code}`))));
  });
  const match = /^Skill Atlas web view: (http:\/\/127\.0\.0\.1:\d+\/)\n$/.exec(line);
  assert.ok(match, line);
  const answer = (await (await fetch(`${match[1]}api/scan?repo=${encodeURIComponent(FIXTURE)}`)).json()) as WebScan;
  assert.equal(answer.skills.length, 5);
});
