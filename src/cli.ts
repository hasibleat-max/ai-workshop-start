#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import type { Source } from './core/scan.ts';
import { openDirectory } from './local.ts';
import { startWebServer } from './web.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string): Promise<Source> =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input);

process.exitCode = await run(process.argv.slice(2), {
  open,
  serve: (port) => startWebServer({ open, port }),
  print: (text) => console.log(text),
  error: (text) => console.error(text),
});
