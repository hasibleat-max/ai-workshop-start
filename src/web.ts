// The local web view: a field for a repository link, its skills and their SKILL.md. The page asks
// this server, which scans with the same core as the CLI. It listens on 127.0.0.1 only, and
// nothing is stored: each scan is answered and forgotten.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AtlasError } from './core/errors.ts';
import { firstSentence, skillLink } from './core/model.ts';
import { scan, type Source } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user typed into the field, as the CLI does. */
  open(input: string): Promise<Source>;
};

/** What `GET /api/scan?repo=<link>` answers: the repository, its skills with their SKILL.md, the warnings. */
export type WebScan = {
  repository: { id: string; url: string; commit: string };
  skills: {
    id: string;
    name: string;
    description: string;
    /** The description's first sentence, as `scan` prints it. */
    summary: string;
    path: string;
    link: string;
    copies: string[];
    text: string;
  }[];
  warnings: string[];
};

/** The server, not yet listening. */
export function createWebServer({ open }: WebOptions): Server {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, type: string, body: string) => {
      response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
      response.end(body);
    };
    // Bound to 127.0.0.1, but a page whose domain resolves there (DNS rebinding) would still be
    // same-origin: only this machine's own names may ask.
    const port = (server.address() as AddressInfo).port;
    if (request.headers.host !== `127.0.0.1:${port}` && request.headers.host !== `localhost:${port}`) {
      return send(403, 'text/plain', 'Forbidden');
    }
    if (request.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
    if (url.pathname === '/') return send(200, 'text/html', PAGE);
    if (url.pathname !== '/api/scan') return send(404, 'text/plain', 'Not found');

    const repo = url.searchParams.get('repo')?.trim() ?? '';
    if (!repo) return send(400, 'application/json', JSON.stringify({ error: 'Enter a GitHub repository URL or a directory' }));
    try {
      const result = await scan(await open(repo));
      const answer: WebScan = {
        repository: { id: result.repository.id, url: result.repository.url, commit: result.repository.commit },
        skills: result.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          summary: firstSentence(skill.description),
          path: skill.path,
          link: skillLink(result.repository, skill),
          copies: skill.copies,
          text: result.texts[skill.path] ?? '',
        })),
        warnings: result.warnings,
      };
      send(200, 'application/json', JSON.stringify(answer));
    } catch (error) {
      const message = error instanceof AtlasError ? error.message : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
      send(error instanceof AtlasError ? 400 : 500, 'application/json', JSON.stringify({ error: message }));
    }
  });
  return server;
}

/** Starts listening on 127.0.0.1; the page's address. Port 0 picks a free one. */
export async function startWebServer(options: WebOptions & { port: number }): Promise<string> {
  const server = createWebServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(new AtlasError(error.code === 'EADDRINUSE' ? `Port ${options.port} is in use; try --port <another>` : `Cannot start the web view: ${error.message}`)),
    );
    server.listen(options.port, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

/** The page: plain HTML, CSS and JavaScript; every text from a repository goes in as text, never as HTML. */
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skill Atlas</title>
<style>
  /* A calm developer tool: neutral surfaces, one accent, light and dark from the system. Every text
     is at least 4.5:1 on its background, borders and focus rings 3:1 (spec/web.md, "The look"). */
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --surface: #f6f8fa; --hover: #eaeef2; --selected: #ddf4ff;
    --text: #1f2328; --muted: #59636e; --border: #818b98;
    --accent: #0969da; --accent-hover: #0858b9; --on-accent: #ffffff;
    --mark: #fff1a8; --on-mark: #1f2328;
    --warning: #7d4e00; --warning-bg: #fff8c5; --danger: #c11d29; --danger-bg: #ffebe9;
    --font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
    --radius: 6px;
    --speed: 150ms;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d1117; --surface: #151b23; --hover: #212830; --selected: #14263d;
      --text: #e6edf3; --muted: #9198a1; --border: #656c76;
      --accent: #4493f8; --accent-hover: #6cb6ff; --on-accent: #0d1117;
      --mark: #e3b341; --on-mark: #0d1117;
      --warning: #e3b341; --warning-bg: #272115; --danger: #ff7b72; --danger-bg: #2d1416;
    }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { background: var(--bg); }
  body { margin: 0; font-family: var(--font); font-size: 14px; line-height: 1.5; background: var(--bg); color: var(--text); display: flex; flex-direction: column; height: 100vh; -webkit-font-smoothing: antialiased; }
  input, button { font: inherit; }
  /* The header: the name, the field and its button in a row; the status and the warnings under them. */
  header { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px 24px; padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
  h1 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; font-weight: 600; white-space: nowrap; }
  h1::before { content: ""; width: 12px; height: 12px; border-radius: 4px; background: var(--accent); }
  form { display: flex; gap: 8px; max-width: 720px; }
  #status, #warnings { grid-column: 1 / -1; }
  input { flex: 1; min-width: 0; height: 36px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); color: var(--text); transition: border-color var(--speed), background-color var(--speed); }
  input::placeholder { color: var(--muted); opacity: 1; }
  #repo:hover { border-color: var(--muted); }
  #repo:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  input:disabled { background: var(--surface); color: var(--muted); cursor: not-allowed; }
  button { flex: none; height: 36px; padding: 0 16px; border: 1px solid transparent; border-radius: var(--radius); background: var(--accent); color: var(--on-accent); font-weight: 600; cursor: pointer; transition: background-color var(--speed), color var(--speed); }
  button:hover { background: var(--accent-hover); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:disabled { background: var(--surface); color: var(--muted); border-color: var(--border); cursor: not-allowed; }
  #status { display: flex; align-items: center; gap: 8px; justify-self: start; min-height: 20px; font-size: 13px; color: var(--muted); }
  #status.error { background: var(--danger-bg); color: var(--danger); padding: 4px 12px; border-radius: var(--radius); }
  /* While a scan runs: a small spinner before the status, by CSS, so the status's text stays. */
  #status.busy::before { content: ""; flex: none; width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 800ms linear infinite; }
  @keyframes spin { to { transform: rotate(1turn); } }
  #warnings { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  #warnings:empty { display: none; }
  #warnings li { background: var(--warning-bg); color: var(--warning); padding: 4px 12px; border-radius: var(--radius); font-size: 13px; overflow-wrap: anywhere; }
  main { flex: 1; display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); min-height: 0; }
  #list { display: flex; flex-direction: column; min-height: 0; background: var(--surface); border-right: 1px solid var(--border); }
  /* The field's frame holds the filter and its counter side by side: the text and the clear button end before the counter. */
  .field { flex: none; display: flex; align-items: center; gap: 8px; height: 36px; margin: 12px; padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); transition: border-color var(--speed), background-color var(--speed); }
  .field:has(#filter:enabled):hover { border-color: var(--muted); }
  .field:has(#filter:disabled) { background: var(--surface); }
  .field:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
  #filter { height: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; outline: none; }
  #counter { flex: none; color: var(--muted); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  #skills { flex: 1; list-style: none; margin: 0; padding: 0 8px 12px; overflow: auto; }
  #skills li { display: grid; gap: 4px; margin-bottom: 4px; padding: 8px 12px; border-radius: var(--radius); cursor: pointer; transition: background-color var(--speed), box-shadow var(--speed); }
  #skills li:hover { background: var(--hover); }
  /* Selected: a tint of the accent and a bar of it at the left. */
  #skills li[aria-selected="true"] { background: var(--selected); box-shadow: inset 3px 0 0 var(--accent); }
  #skills li:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .name { font-size: 14px; font-weight: 600; color: var(--text); overflow-wrap: anywhere; }
  .description { font-size: 13px; color: var(--muted); }
  .path { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .found { margin-top: 4px; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  #skill pre, .found { font-family: var(--mono); }
  /* The highlight reaches a pixel past the text without moving it. */
  mark { background: var(--mark); color: var(--on-mark); border-radius: 2px; box-shadow: 0 0 0 1px var(--mark); }
  #skill { overflow: auto; padding: 24px 32px; }
  #skill h2 { margin: 0 0 4px; font-size: 20px; font-weight: 600; line-height: 1.3; }
  #skill a { color: var(--accent); font-size: 13px; text-decoration: none; overflow-wrap: anywhere; }
  #skill a:hover { text-decoration: underline; }
  #skill a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
  #skill .path { margin: 4px 0 0; }
  #skill pre { margin: 16px 0 0; padding: 16px; border-radius: 8px; background: var(--surface); font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  .empty { margin: 64px auto 0; max-width: 360px; padding: 0 24px; color: var(--muted); text-align: center; }
  .empty::before { content: ""; display: block; width: 40px; height: 48px; margin: 0 auto 16px; border: 2px dashed var(--border); border-radius: 8px; }
  /* Narrow windows: one column, the list above the SKILL.md pane, and the page scrolls. */
  @media (width < 720px) {
    body { height: auto; min-height: 100vh; }
    header { grid-template-columns: minmax(0, 1fr); padding: 12px 16px; }
    main { grid-template-columns: 1fr; }
    #list { max-height: 50vh; border-right: 0; border-bottom: 1px solid var(--border); }
    #skill { overflow: visible; padding: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>
<header>
  <h1>Skill Atlas</h1>
  <form id="scan">
    <input id="repo" name="repo" placeholder="https://github.com/owner/repo or a local directory" aria-label="Repository link" autofocus required>
    <button id="go">Scan</button>
  </form>
  <div id="status" role="status"></div>
  <ul id="warnings"></ul>
</header>
<main>
  <div id="list">
    <div class="field">
      <input id="filter" type="search" placeholder="Filter the skills" aria-label="Filter the skills" autocomplete="off" disabled>
      <span id="counter" aria-hidden="true" hidden></span>
    </div>
    <ul id="skills" role="listbox" aria-label="Skills"></ul>
  </div>
  <section id="skill" aria-label="SKILL.md"><p class="empty">Scan a repository, then pick a skill to read its SKILL.md.</p></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// busy: a scan runs, and the CSS puts a spinner before the status.
function status(text, state = '') {
  $('status').textContent = text;
  $('status').className = state;
}

function counter(text) {
  $('counter').textContent = text;
  $('counter').hidden = !text;
}

// The last scan's answer and the selected skill's id; the filter only narrows what that answer has.
let answer = null;
let selected = null;
// The filter as a case-insensitive pattern for its literal text; null when empty.
let query = null;

const has = (text) => text.search(query) !== -1;

/** The text, each match of the filter in a <mark>. */
function marked(text) {
  if (!query) return [text];
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(query)) {
    parts.push(text.slice(last, match.index), el('mark', { textContent: match[0] }));
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function show(skill) {
  selected = skill.id;
  for (const item of $('skills').children) item.setAttribute('aria-selected', String(item.dataset.id === skill.id));
  // An http:// page cannot open a file:// link: a local skill's path is shown as text.
  const link = skill.link.startsWith('file:')
    ? el('p', { className: 'path', textContent: skill.path })
    : el('a', { href: skill.link, textContent: skill.link, target: '_blank', rel: 'noreferrer' });
  const parts = [el('h2', { textContent: skill.name }), link];
  if (skill.copies.length) parts.push(el('p', { className: 'path', textContent: 'also in ' + skill.copies.join(', ') }));
  parts.push(el('pre', {}, ...marked(skill.text)));
  $('skill').replaceChildren(...parts);
}

/** The skills of the last scan that match the filter, its status, and the selected one's SKILL.md. */
function render() {
  const filter = $('filter').value.trim();
  query = filter ? new RegExp(filter.replace(/[^\\w\\s]/g, '\\\\$&'), 'gi') : null;
  const skills = query ? answer.skills.filter((skill) => has(skill.name) || has(skill.path) || has(skill.text)) : answer.skills;
  const total = answer.skills.length;
  status(answer.repository.id + ' · ' + (query ? skills.length + ' of ' : '') + total + (total === 1 ? ' skill' : ' skills'));
  // The same count by the field; the status already announces it.
  counter(query ? skills.length + ' of ' + total : '');
  $('skills').replaceChildren(...skills.map((skill) => {
    const item = el('li', { role: 'option', tabIndex: 0 },
      el('div', { className: 'name', textContent: skill.name }),
      el('div', { className: 'description', textContent: skill.summary }),
      el('div', { className: 'path', textContent: skill.path }));
    // What the filter found: its first line in the SKILL.md; none for a match in the path only.
    const line = query && skill.text.split(/\\r?\\n/).find(has);
    if (line) item.append(el('div', { className: 'found' }, ...marked(line.trim())));
    item.dataset.id = skill.id;
    item.addEventListener('click', () => show(skill));
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(skill); } });
    return item;
  }));
  if (skills.length) return show(skills.find((skill) => skill.id === selected) ?? skills[0]);
  selected = null;
  const empty = total ? 'No skills match "' + filter + '".' : 'No project skills in this repository.';
  $('skill').replaceChildren(el('p', { className: 'empty', textContent: empty }));
}

$('filter').addEventListener('input', render);

$('scan').addEventListener('submit', async (event) => {
  event.preventDefault();
  const repo = $('repo').value.trim();
  $('go').disabled = true;
  $('filter').value = '';
  $('filter').disabled = true;
  counter('');
  answer = null;
  selected = null;
  $('skills').replaceChildren();
  $('warnings').replaceChildren();
  $('skill').replaceChildren(el('p', { className: 'empty', textContent: 'Scan a repository, then pick a skill to read its SKILL.md.' }));
  status('Scanning ' + repo + '…', 'busy');
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(repo));
    const body = await response.json();
    if (!response.ok) return status(body.error, 'error');
    answer = body;
    $('warnings').replaceChildren(...answer.warnings.map((text) => el('li', { textContent: 'warning: ' + text })));
    $('filter').disabled = answer.skills.length === 0;
    render();
  } catch (error) {
    status('Cannot reach the Skill Atlas server: ' + error.message, 'error');
  } finally {
    $('go').disabled = false;
  }
});
</script>
</body>
</html>
`;
