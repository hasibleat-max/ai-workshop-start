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
  :root { color-scheme: light dark; --border: #8884; --muted: #8889; --accent: #3b82f6; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; display: flex; flex-direction: column; height: 100vh; }
  header { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  h1 { font-size: 16px; margin: 0 0 8px; }
  form { display: flex; gap: 8px; }
  input { flex: 1; padding: 8px 10px; font: inherit; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; }
  button { padding: 8px 16px; font: inherit; border: 0; border-radius: 6px; background: var(--accent); color: white; cursor: pointer; }
  button:disabled { opacity: .6; cursor: default; }
  #status { margin-top: 8px; color: var(--muted); min-height: 1.5em; }
  #status.error { color: #e5484d; }
  #warnings { margin: 4px 0 0; padding-left: 20px; color: #d97706; }
  main { flex: 1; display: grid; grid-template-columns: minmax(240px, 1fr) 2fr; min-height: 0; }
  #list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); }
  #filter { flex: none; margin: 8px 16px; }
  #skills { flex: 1; list-style: none; margin: 0; padding: 0; overflow: auto; border-top: 1px solid var(--border); }
  #skills li { padding: 10px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  #skills li:hover { background: #8881; }
  #skills li[aria-selected="true"] { background: #3b82f622; box-shadow: inset 3px 0 var(--accent); }
  .name { font-weight: 600; }
  .description, .path { color: var(--muted); font-size: 12px; }
  .found { font-size: 12px; font-family: ui-monospace, monospace; white-space: pre-wrap; word-break: break-word; }
  mark { background: #facc1566; color: inherit; }
  #skill { overflow: auto; padding: 16px; }
  #skill h2 { margin: 0 0 4px; font-size: 18px; }
  #skill a { color: var(--accent); word-break: break-all; }
  #skill pre { white-space: pre-wrap; word-break: break-word; padding: 12px; border: 1px solid var(--border); border-radius: 6px; font: 13px/1.5 ui-monospace, monospace; }
  .empty { color: var(--muted); padding: 16px; }
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
    <input id="filter" type="search" placeholder="Filter the skills" aria-label="Filter the skills" autocomplete="off" disabled>
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

function status(text, error = false) {
  $('status').textContent = text;
  $('status').className = error ? 'error' : '';
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
  answer = null;
  selected = null;
  $('skills').replaceChildren();
  $('warnings').replaceChildren();
  $('skill').replaceChildren(el('p', { className: 'empty', textContent: 'Scan a repository, then pick a skill to read its SKILL.md.' }));
  status('Scanning ' + repo + '…');
  try {
    const response = await fetch('/api/scan?repo=' + encodeURIComponent(repo));
    const body = await response.json();
    if (!response.ok) return status(body.error, true);
    answer = body;
    $('warnings').replaceChildren(...answer.warnings.map((text) => el('li', { textContent: 'warning: ' + text })));
    $('filter').disabled = answer.skills.length === 0;
    render();
  } catch (error) {
    status('Cannot reach the Skill Atlas server: ' + error.message, true);
  } finally {
    $('go').disabled = false;
  }
});
</script>
</body>
</html>
`;
