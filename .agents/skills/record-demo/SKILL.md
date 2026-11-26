---
name: record-demo
description: Record a demo of a pull request's change that plays right in a GitHub comment, such as a GIF of the web view in use. Use when a pull request is ready for a person, or when asked for a demo of one.
---

# Record a demo

The input: a pull request, its commit and what to show, which is what its issue asks for, with the
issue's examples where it has them. The output: the `### Demo` block for a comment on the pull
request, or one line that says why there is none. Run from your own skill, as
[issue-to-pr](../issue-to-pr/SKILL.md) does, hand the block back. Asked for a demo directly, post it
as a comment on the pull request.

Record from a checkout at that commit. In issue-to-pr, that is the checkout you work in. Otherwise,
make one: `git worktree add <dir> <sha>`, then `npm ci` in it.

## 1. What kind

The person who merges sees what changed in the pull request, without checking it out:

- **The web view changed**: an animated GIF of the page in use. GitHub plays a GIF in a comment, but
  neither a `<video>` tag nor a link to a video file.
- **What `scan` prints changed**: no GIF. The command and what it prints, in a `console` block.
  Skip to step 5.
- **Nothing a person can see changed** (tests, a refactoring): no demo; say so.

## 2. Tools

In a new directory outside the checkout. Run npm from inside it: `npm init` ignores `--prefix` and
would rewrite the checkout's `package.json`.

```console
$ demo=$(mktemp -d) && (cd "$demo" && npm init -y && npm install playwright ffmpeg-static)
$ "$demo/node_modules/.bin/playwright" install chromium    # --with-deps if it lacks system libraries
$ git status --short    # unchanged: the tools are not in the checkout
```

## 3. Record

Start `./skill-atlas serve --port 0` in the background, from the checkout. It prints
`Skill Atlas web view: <url>`. Then write a script in another new directory, and run it as
`node <script> "$demo" <url> "$demo/out"`. It does what the issue describes, on `./fixture`, at a
pace a person can follow: typing with a delay, a pause of 1–2 seconds after each step, 10–30
seconds in all. For example, the filter:

```js
import { createRequire } from 'node:module';
const [modules, url, out] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/`)('playwright');
const size = { width: 1280, height: 720 };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: size, recordVideo: { dir: out, size } });
const page = await context.newPage();
const pause = (ms = 1500) => page.waitForTimeout(ms);
await page.goto(url);
await page.locator('#repo').pressSequentially('./fixture', { delay: 60 });
await page.click('#go');
await page.waitForSelector('#skills li');
await pause();
await page.locator('#filter').pressSequentially('commit', { delay: 150 });
await pause(2000);
const video = page.video();
await context.close(); // writes the video
await browser.close();
console.log(await video.path());
```

Stop the server. Make the GIF: 10 frames a second, 960 pixels wide. Keep it under 5 MB: make it
shorter, or use fewer frames or fewer pixels.

```console
$ ffmpeg=$(node -p "require('$demo/node_modules/ffmpeg-static')")
$ "$ffmpeg" -i <video>.webm -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" "$demo/demo.gif"
$ "$ffmpeg" -ss 5 -i <video>.webm -frames:v 1 "$demo/frame.png"
```

Look at a frame or two. The change must be on screen, and nothing else may be: no tokens, no
other repositories, no paths outside the checkout.

## 4. Publish

On the branch `demos`. It has only demos, shares no history with `main` and is never merged. CI
runs on every push, and this branch has no code, so every commit message says `[skip ci]`.

```console
$ git fetch origin demos:demos || git branch demos "$(git commit-tree "$(git hash-object -w -t tree /dev/null)" -m 'Demos of pull requests [skip ci]')"
$ git worktree add "$demo/branch" demos
$ mkdir -p "$demo/branch/pr-<pr>" && cp "$demo/demo.gif" "$demo/branch/pr-<pr>/<sha>.gif"
$ git -C "$demo/branch" add -A && git -C "$demo/branch" commit -m "Demo of #<pr> at <sha> [skip ci]"
$ git -C "$demo/branch" push origin demos && git -C "$demo/branch" rev-parse HEAD
$ git worktree remove "$demo/branch"
```

If the push is rejected, another demo came first: `git -C "$demo/branch" pull --rebase origin demos`,
then push again.

## 5. The block

Link the GIF at the `demos` commit, so the comment always shows this demo. `<owner>/<repo>` is
`gh repo view --json nameWithOwner --jq .nameWithOwner`.

```markdown
### Demo

<What it shows, in one sentence.>

![Demo: <what it shows>](https://raw.githubusercontent.com/<owner>/<repo>/<demos commit>/pr-<pr>/<sha>.gif)
```

For a change in what `scan` prints, the block has the command and its output in a `console` block
in place of the GIF. Run it at the commit, on `./fixture` or on what the issue names.
