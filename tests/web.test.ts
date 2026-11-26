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
import { ABBREVIATIONS, CLI, EXAMPLE, EXAMPLE_COMMIT, FIXTURE, INDENTED } from './helpers.ts';

const github = replay({ ...EXAMPLE, ...ABBREVIATIONS, ...INDENTED });
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

/** The page, its script running in a DOM against the server. */
async function load() {
  const dom = new JSDOM(await (await fetch(`${base}/`)).text(), {
    url: `${base}/`,
    runScripts: 'dangerously',
    beforeParse: (window) => Object.assign(window, { fetch: (url: string) => fetch(new URL(url, base)) }),
  });
  const document = dom.window.document;
  const $ = (id: string) => document.getElementById(id)!;
  const text = (element: Element) => element.textContent;
  const marks = (element: Element) => [...element.querySelectorAll('mark')].map(text);
  const view = {
    $,
    window: dom.window,
    /** Scans `repo` as a user would: types it and presses Scan, then waits for the answer. */
    async scan(repo: string) {
      ($('repo') as HTMLInputElement).value = repo;
      $('go').click();
      for (const start = Date.now(); ($('go') as HTMLButtonElement).disabled || $('status').textContent!.startsWith('Scanning'); ) {
        if (Date.now() - start > 5000) throw new Error('the page did not finish scanning');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return view;
    },
    /** Types `value` into the filter. */
    filter(value: string) {
      const field = $('filter') as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      return view;
    },
    get filterField() {
      return $('filter') as HTMLInputElement;
    },
    get status() {
      return $('status').textContent;
    },
    /** The filter field's counter; null when there is none. */
    get counter() {
      const counter = $('counter');
      return counter.hidden ? null : counter.textContent;
    },
    get error() {
      return $('status').className === 'error';
    },
    get warnings() {
      return [...$('warnings').children].map(text);
    },
    get skills() {
      return [...$('skills').children].map((item) => [...item.children].map(text));
    },
    /** Each skill shown: its name, and the marked parts of what the filter found. */
    get found() {
      return [...$('skills').children].map((item) => [item.querySelector('.name')!.textContent, marks(item)]);
    },
    selected: () => [...$('skill').children].map((element) => ({ tag: element.tagName, text: element.textContent, href: element.getAttribute('href') })),
    /** The marked parts of the SKILL.md pane. */
    get selectedMarks() {
      return marks($('skill'));
    },
    pick: (index: number) => ($('skills').children[index] as HTMLElement).click(),
  };
  return view;
}

/** What the page shows after scanning `repo`. */
const page = async (repo: string) => (await load()).scan(repo);

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

test('the page: the first sentence does not end at an abbreviation such as e.g. or i.e., also after a bracket', async () => {
  const shown = await page('https://github.com/JetBrains/abbreviations');
  assert.deepEqual(shown.skills, [
    ['a', 'Use e.g. for this.', '.claude/skills/a/SKILL.md'],
    ['b', 'Build tools, i.e. Gradle or Maven.', '.claude/skills/b/SKILL.md'],
    ['c', 'Run the build tool (e.g. Gradle).', '.claude/skills/c/SKILL.md'],
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

const FIXTURE_SKILLS = ['code-style', 'commits', 'pull-requests', 'release-checklist', 'run-tests'];
const names = (shown: { skills: (string | null)[][] }) => shown.skills.map((item) => item[0]);
const fixtureText = (path: string) => readFileSync(join(FIXTURE, path), 'utf8');

test('the filter: disabled until a scan finds skills; a new scan clears it', async () => {
  const shown = await load();
  assert.equal(shown.filterField.disabled, true);
  await shown.scan(FIXTURE);
  assert.equal(shown.filterField.disabled, false);
  shown.filter('commit');
  assert.equal(shown.status, 'fixture · 2 of 5 skills');
  await shown.scan(FIXTURE);
  assert.equal(shown.filterField.value, '');
  assert.equal(shown.status, 'fixture · 5 skills');
  assert.deepEqual(names(shown), FIXTURE_SKILLS);
  shown.filter('commit');
  await shown.scan(join(FIXTURE, 'docs'));
  assert.equal(shown.status, 'docs · 0 skills');
  assert.equal(shown.filterField.value, '');
  assert.equal(shown.filterField.disabled, true);
  await shown.scan(FIXTURE);
  shown.filter('commit');
  await shown.scan(join(FIXTURE, 'no-such-directory'));
  assert.equal(shown.error, true);
  assert.equal(shown.filterField.value, '');
  assert.equal(shown.filterField.disabled, true);
});

test('the filter: empty → all five skills, the status as without a filter, nothing marked', async () => {
  const shown = (await page(FIXTURE)).filter('commit').filter('');
  assert.equal(shown.status, 'fixture · 5 skills');
  assert.deepEqual(shown.skills, [
    ['code-style', "Follow the project's code style.", '.github/skills/code-style/SKILL.md'],
    ['commits', 'Write commit messages the way this repository does.', '.claude/skills/commits/SKILL.md'],
    ['pull-requests', 'Open pull requests the way this repository does.', '.agents/skills/pull-requests/SKILL.md'],
    ['release-checklist', '', '.agents/skills/release-checklist/SKILL.md'],
    ['run-tests', 'Run the tests the way CI does.', 'agent/skills/run-tests/SKILL.md'],
  ]);
  assert.deepEqual(shown.selectedMarks, []);
  shown.filter('   ');
  assert.equal(shown.status, 'fixture · 5 skills');
  assert.deepEqual(names(shown), FIXTURE_SKILLS);
});

test('the filter: commit → code-style, found in its description, and commits; every match in the pane marked', async () => {
  const shown = (await page(FIXTURE)).filter('commit');
  assert.equal(shown.status, 'fixture · 2 of 5 skills');
  assert.deepEqual(shown.skills, [
    [
      'code-style',
      "Follow the project's code style.",
      '.github/skills/code-style/SKILL.md',
      "description: Follow the project's code style. Use before committing Kotlin or Java changes.",
    ],
    ['commits', 'Write commit messages the way this repository does.', '.claude/skills/commits/SKILL.md', 'name: commits'],
  ]);
  assert.deepEqual(shown.found, [
    ['code-style', ['commit']],
    ['commits', ['commit']],
  ]);
  // code-style, selected by the scan, still matches.
  assert.equal(shown.selected()[0]!.text, 'code-style');
  assert.equal(shown.selected().at(-1)!.text, fixtureText('.github/skills/code-style/SKILL.md'));
  assert.deepEqual(shown.selectedMarks, ['commit']);
  shown.pick(1);
  assert.equal(shown.selected().at(-1)!.text, fixtureText('.claude/skills/commits/SKILL.md'));
  assert.deepEqual(shown.selectedMarks, ['commit', 'commit', 'commit', 'Commit']);
});

test('the filter: TABS, ignoring case and the spaces around it → code-style, "no tabs" marked', async () => {
  const shown = (await page(FIXTURE)).filter('  TABS ');
  assert.equal(shown.status, 'fixture · 1 of 5 skills');
  assert.deepEqual(shown.skills, [
    ['code-style', "Follow the project's code style.", '.github/skills/code-style/SKILL.md', '- Four spaces, no tabs; lines up to 120 characters.'],
  ]);
  assert.deepEqual(shown.found, [['code-style', ['tabs']]]);
  assert.deepEqual(shown.selectedMarks, ['tabs']);
});

test('the filter: .agents/ → pull-requests and release-checklist by path, no line, nothing marked; not by a copy\'s path', async () => {
  const shown = (await page(FIXTURE)).filter('.agents/');
  assert.equal(shown.status, 'fixture · 2 of 5 skills');
  assert.deepEqual(shown.skills, [
    ['pull-requests', 'Open pull requests the way this repository does.', '.agents/skills/pull-requests/SKILL.md'],
    ['release-checklist', '', '.agents/skills/release-checklist/SKILL.md'],
  ]);
  assert.equal(shown.selected()[0]!.text, 'pull-requests');
  assert.deepEqual(shown.selectedMarks, []);
  // Only the path the skill links to, not its copies': pull-requests is also in .claude/skills.
  shown.filter('.claude/');
  assert.equal(shown.status, 'fixture · 1 of 5 skills');
  assert.deepEqual(names(shown), ['commits']);
});

test('the filter: no-such-skill → no skills, a message in the pane; .* is text, not a pattern', async () => {
  const shown = (await page(FIXTURE)).filter('no-such-skill');
  assert.equal(shown.status, 'fixture · 0 of 5 skills');
  assert.deepEqual(shown.skills, []);
  assert.deepEqual(shown.selected(), [{ tag: 'P', text: 'No skills match "no-such-skill".', href: null }]);
  // The filter is text, not a pattern.
  shown.filter('.*');
  assert.equal(shown.status, 'fixture · 0 of 5 skills');
});

test('the filter: the selected skill stays while it matches, else the first skill shown', async () => {
  const shown = await page(FIXTURE);
  shown.pick(1);
  shown.filter('commit');
  assert.equal(shown.selected()[0]!.text, 'commits');
  assert.equal(shown.$('skills').children[1]!.getAttribute('aria-selected'), 'true');
  shown.filter('tabs');
  assert.equal(shown.selected()[0]!.text, 'code-style');
  assert.equal(shown.$('skills').children[0]!.getAttribute('aria-selected'), 'true');
  shown.filter('');
  assert.equal(shown.selected()[0]!.text, 'code-style');
  shown.pick(4);
  shown.filter('no-such-skill').filter('');
  assert.equal(shown.selected()[0]!.text, 'code-style');
});

test('the filter: one skill → 1 of 1 skill; what it found trimmed, every match in it marked, also with Windows line endings', async () => {
  const shown = (await page('https://github.com/JetBrains/indented')).filter('linter');
  assert.equal(shown.status, 'JetBrains/indented · 1 of 1 skill');
  assert.deepEqual(shown.skills, [['lint', 'Lint the code.', '.claude/skills/lint/SKILL.md', 'Run the Linter, then fix what the linter says.']]);
  assert.deepEqual(shown.found, [['lint', ['Linter', 'linter']]]);
});

test('the filter: nothing fetched, nothing stored', async () => {
  const shown = await page(FIXTURE);
  let fetched = 0;
  const fetch = shown.window.fetch;
  shown.window.fetch = (...args: Parameters<typeof fetch>) => (fetched++, fetch(...args));
  shown.filter('commit');
  assert.equal(fetched, 0);
  assert.equal(shown.window.location.href, `${base}/`);
  assert.equal(shown.window.localStorage.length, 0);
  assert.equal(shown.window.sessionStorage.length, 0);
  assert.equal(shown.filterField.autocomplete, 'off');
});

test('the filter: a counter in the field, n of total, as you type; none when empty; a new scan clears it; not announced', async () => {
  const shown = await load();
  assert.equal(shown.counter, null);
  await shown.scan(FIXTURE);
  assert.equal(shown.counter, null);
  assert.equal(shown.$('counter').getAttribute('aria-hidden'), 'true');
  assert.equal(shown.$('counter').parentElement, shown.filterField.parentElement);
  // On ./fixture, as in the issue's table.
  for (const [filter, counter] of [
    ['commit', '2 of 5'],
    ['TABS', '1 of 5'],
    ['.agents/', '2 of 5'],
    ['no-such-skill', '0 of 5'],
    ['', null],
    ['   ', null],
  ] as const) {
    shown.filter(filter);
    assert.equal(shown.counter, counter, filter);
    // The status line's numbers.
    assert.equal(shown.status, counter ? `fixture · ${counter} skills` : 'fixture · 5 skills', filter);
  }
  // As you type: c is in every skill's SKILL.md, co only in code-style's and commits'.
  assert.deepEqual(['c', 'co', 'com'].map((typed) => shown.filter(typed).counter), ['5 of 5', '2 of 5', '2 of 5']);
  // The status line stays, with the same numbers.
  assert.equal(shown.status, 'fixture · 2 of 5 skills');
  await shown.scan(FIXTURE);
  assert.equal(shown.counter, null);
  shown.filter('commit');
  await shown.scan(join(FIXTURE, 'no-such-directory'));
  assert.equal(shown.counter, null);
  const one = await page('https://github.com/JetBrains/indented');
  assert.equal(one.filter('linter').counter, '1 of 1');
});

/** The page's stylesheet, as the server sends it, without its comments. */
const stylesheet = async () => {
  const html = await (await fetch(`${base}/`)).text();
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
};

/** WCAG's contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The custom properties of a block of declarations: name → #rrggbb. */
const palette = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, value]) => [name, value.toLowerCase()]));

/** The light palette on :root, and the dark one on :root under prefers-color-scheme: dark. */
async function palettes() {
  const css = await stylesheet();
  const light = /^\s*:root\s*\{([^}]*)\}/m.exec(css);
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css);
  assert.ok(light, 'a light palette on :root');
  assert.ok(dark, 'a dark palette on :root under prefers-color-scheme: dark');
  return { css, root: light[1], light: palette(light[1]), dark: palette(dark[1]) };
}

test('the look: a light and a dark palette on :root, following the system, as the spec gives them', async () => {
  const { css, root, light, dark } = await palettes();
  assert.match(root, /color-scheme:\s*light dark;/);
  assert.deepEqual(light, {
    bg: '#ffffff', surface: '#f6f8fa', hover: '#eaeef2', selected: '#ddf4ff', text: '#1f2328', muted: '#59636e', border: '#818b98',
    accent: '#0969da', 'accent-hover': '#0858b9', 'on-accent': '#ffffff', mark: '#fff1a8', 'on-mark': '#1f2328',
    warning: '#7d4e00', 'warning-bg': '#fff8c5', danger: '#c11d29', 'danger-bg': '#ffebe9',
  });
  assert.deepEqual(dark, {
    bg: '#0d1117', surface: '#151b23', hover: '#212830', selected: '#14263d', text: '#e6edf3', muted: '#9198a1', border: '#656c76',
    accent: '#4493f8', 'accent-hover': '#6cb6ff', 'on-accent': '#0d1117', mark: '#e3b341', 'on-mark': '#0d1117',
    warning: '#e3b341', 'warning-bg': '#272115', danger: '#ff7b72', 'danger-bg': '#2d1416',
  });
  // Every color the page uses is in both palettes; no color outside them.
  for (const [, name] of css.matchAll(/var\(--([\w-]+)\)/g)) {
    if (['font', 'mono', 'radius', 'speed'].includes(name)) continue;
    assert.ok(name in light && name in dark, `--${name} in both palettes`);
  }
  const rules = css.replace(/:root\s*\{[^}]*\}/g, '');
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'colors only from the palettes');
});

test('the look: in light and in dark, every text at least 4.5:1 on its background; borders and focus rings at least 3:1', async () => {
  const { light, dark } = await palettes();
  for (const [scheme, colors] of [['light', light], ['dark', dark]] as const) {
    for (const [text, background, least] of [
      ['text', 'bg', 4.5], // text, skill names, the SKILL.md pane
      ['muted', 'bg', 4.5], // descriptions, paths, the status, the counter, placeholders
      ['text', 'surface', 4.5], // the list's column, the SKILL.md text
      ['muted', 'surface', 4.5], // a disabled field or button
      ['text', 'hover', 4.5], // the skill under the pointer
      ['muted', 'hover', 4.5],
      ['text', 'selected', 4.5], // the selected skill
      ['muted', 'selected', 4.5],
      ['accent', 'bg', 4.5], // links
      ['on-accent', 'accent', 4.5], // the Scan button
      ['on-accent', 'accent-hover', 4.5], // the Scan button under the pointer
      ['on-mark', 'mark', 4.5], // what the filter found
      ['warning', 'warning-bg', 4.5], // warnings
      ['danger', 'danger-bg', 4.5], // an error
      ['border', 'bg', 3], // the fields' borders, the rules
      ['border', 'surface', 3],
      ['accent', 'bg', 3], // focus rings, wherever they are
      ['accent', 'surface', 3],
      ['accent', 'hover', 3],
      ['accent', 'selected', 3], // and the selected skill's bar
    ] as const) {
      const ratio = contrast(colors[text], colors[background]);
      assert.ok(ratio >= least, `${scheme}: --${text} on --${background}: ${ratio.toFixed(2)}`);
    }
  }
});

test('the look: hierarchy and states; focus visible on every field, button, skill and link', async () => {
  const css = await stylesheet();
  const rule = (selector: string) => new RegExp(selector.replace(/[.#[\]()]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css)?.[1] ?? '';
  assert.match(rule('.name'), /font-weight:\s*600;/);
  assert.match(rule('.name'), /color:\s*var\(--text\);/);
  assert.match(rule('.description'), /color:\s*var\(--muted\);/);
  assert.match(rule('.path'), /color:\s*var\(--muted\);/);
  assert.match(rule('#skills li:hover'), /background:\s*var\(--hover\);/);
  assert.match(rule('#skills li[aria-selected="true"]'), /background:\s*var\(--selected\);[^}]*box-shadow:\s*inset 3px 0 0 var\(--accent\);/);
  assert.match(rule('mark'), /background:\s*var\(--mark\);\s*color:\s*var\(--on-mark\);/);
  assert.match(rule('input:disabled'), /background:\s*var\(--surface\);\s*color:\s*var\(--muted\);/);
  assert.match(rule('button:disabled'), /background:\s*var\(--surface\);\s*color:\s*var\(--muted\);/);
  assert.match(rule('button:hover'), /background:\s*var\(--accent-hover\);/);
  assert.match(rule('#warnings li'), /background:\s*var\(--warning-bg\);\s*color:\s*var\(--warning\);/);
  assert.match(rule('#status.error'), /background:\s*var\(--danger-bg\);\s*color:\s*var\(--danger\);/);
  assert.match(rule('.empty'), /color:\s*var\(--muted\);[^}]*text-align:\s*center;/);
  for (const selector of ['#repo:focus-visible', '.field:focus-within', 'button:focus-visible', '#skills li:focus-visible', '#skill a:focus-visible']) {
    assert.match(rule(selector), /outline:\s*2px solid var\(--accent\)/, selector);
  }
  // The counter's hidden attribute still hides it.
  assert.doesNotMatch(rule('#counter'), /display:/);
});

test('the look: nothing from outside; system fonts, monospace only for the SKILL.md text and what the filter found; no CRT', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const css = await stylesheet();
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /\bsrc\s*=/i);
  assert.doesNotMatch(css, /@import/i);
  assert.doesNotMatch(css, /@font-face/i);
  assert.doesNotMatch(css, /url\(/i);
  assert.match(css, /--font:\s*system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;/);
  assert.match(css, /--mono:\s*ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;/);
  assert.match(css, /body\s*\{[^}]*font-family:\s*var\(--font\);/);
  const mono = [...css.matchAll(/([^{}]+)\{[^}]*font-family:\s*var\(--mono\)/g)].map((match) => match[1].trim());
  assert.deepEqual(mono, ['#skill pre, .found']);
  assert.doesNotMatch(css.replace(/--mono:[^;]*;/, ''), /monospace/, 'monospace only in --mono');
  // The CRT is gone: no glow, no scanlines, no prompts or brackets, no block cursor, no uppercase heading.
  assert.doesNotMatch(css, /text-shadow|repeating-linear-gradient|text-transform|█|content:\s*"[^"]/);
  const shown = await load();
  assert.equal(shown.window.document.querySelector('h1')!.textContent, 'Skill Atlas');
  assert.equal(shown.$('go').textContent, 'Scan');
});

test('the look: a scan in progress shows a spinner before the status, by CSS; the status text stays', async () => {
  const shown = await load();
  const fetch = shown.window.fetch;
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  shown.window.fetch = async (...args: Parameters<typeof fetch>) => (await answered, fetch(...args));
  ($('repo') as HTMLInputElement).value = FIXTURE;
  function $(id: string) {
    return shown.$(id);
  }
  $('go').click();
  assert.equal(shown.status, `Scanning ${FIXTURE}…`);
  assert.equal($('status').className, 'busy');
  answer();
  await shown.scan(FIXTURE);
  assert.equal($('status').className, '');
  await shown.scan(join(FIXTURE, 'no-such-directory'));
  assert.equal($('status').className, 'error');
  const spinner = /#status\.busy::before\s*\{([^}]*)\}/.exec(await stylesheet());
  assert.ok(spinner, 'a spinner before the busy status');
  assert.match(spinner[1], /content:\s*"";/);
  assert.match(spinner[1], /border-radius:\s*50%;/);
  assert.match(spinner[1], /border-top-color:\s*var\(--accent\);/);
  assert.match(spinner[1], /animation:\s*spin\b[^;]*infinite;/);
  assert.match(await stylesheet(), /@keyframes spin\s*\{\s*to\s*\{\s*transform:\s*rotate\(1turn\);\s*\}\s*\}/);
});

test('the look: under 720 px wide, the list above the SKILL.md pane, and the page scrolls', async () => {
  const css = await stylesheet();
  const narrow = /@media \(max-width: 719px\)\s*\{([\s\S]*?)\}\s*\}/.exec(css);
  assert.ok(narrow, 'a rule for narrow windows');
  assert.match(narrow[1], /body\s*\{[^}]*height:\s*auto;/);
  assert.match(narrow[1], /main\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.match(narrow[1], /#skills\s*\{[^}]*max-height:\s*50vh;/);
  // The list comes first in the page, so in one column it is above the pane.
  const shown = await load();
  assert.equal(shown.$('list').nextElementSibling, shown.$('skill'));
});

test('the look: transitions of 150 ms; with prefers-reduced-motion: reduce, nothing moves', async () => {
  const css = await stylesheet();
  assert.match(css, /--speed:\s*150ms;/);
  const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map((match) => match[1]).filter((value) => value !== 'none !important');
  assert.ok(transitions.length > 0, 'some transitions');
  for (const value of transitions) assert.match(value, /var\(--speed\)/, value);
  const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\}\s*\}/.exec(css);
  assert.ok(reduced, 'a prefers-reduced-motion: reduce rule');
  assert.match(reduced[1], /\*, \*::before, \*::after\s*\{/);
  assert.match(reduced[1], /animation:\s*none !important;/);
  assert.match(reduced[1], /transition:\s*none !important;/);
});
