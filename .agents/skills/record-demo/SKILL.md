---
name: record-demo
description: Record a demo of a change that plays right in a GitHub pull request, such as a GIF of the web view in use. Use before opening a pull request that changes what a person sees, after a push that changes it, or when asked for a demo.
---

# Record a demo

The input: a commit, and what to show, which is what its issue asks for, with the issue's examples
where it has them. The output is one of two blocks (step 6):

- **the demo block**, for the pull request's description;
- **the no-demo block**, for a comment on the pull request, when recording failed. It says where and
  why. Never fail silently: a pull request with neither a demo nor the comment that says why is
  what this skill prevents.

Run from your own skill, as [issue-to-pr](../issue-to-pr/SKILL.md) does, hand the block back. Asked
directly for a demo of a pull request, put the demo block in its description
(`gh pr edit <pr> --body-file <file>`), or post the no-demo block as a comment.

Record from a checkout at that commit. In issue-to-pr, that is the checkout you work in. Otherwise,
make one: `git worktree add <dir> <sha>`, then `npm ci` in it.

## 1. What kind

The person who merges sees what changed in the pull request, without checking it out:

- **The web view changed**: an animated GIF of the page in use. GitHub plays a GIF in a comment, but
  neither a `<video>` tag nor a link to a video file.
- **What `scan` prints changed**: no GIF. The command and what it prints, in a `console` block.
  Skip to step 6.
- **Nothing a person can see changed** (tests, a refactoring): no block, only the line
  `No demo: nothing a person can see changed.`

## 2. Tools

In a new directory outside the checkout. Run npm from inside it: `npm init` ignores `--prefix` and
would rewrite the checkout's `package.json`. A cloud environment may not reach every download, so
give each one 5 minutes at most. When one fails, try the next way, and keep what it printed for the
no-demo block.

```console
$ demo=$(mktemp -d) && (cd "$demo" && npm init -y && timeout 300 npm install playwright)
$ (cd "$demo" && timeout 300 npm install ffmpeg-static)    # on its own: it downloads a binary
$ git status --short    # unchanged: the tools are not in the checkout
```

**A browser**: the first of these that works.

1. Playwright's Chromium: `timeout 300 "$demo/node_modules/.bin/playwright" install chromium`.
   Add `--with-deps` if it lacks system libraries. If it is already downloaded, this returns at once.
2. One the environment has:
   `browser=$(command -v chromium chromium-browser google-chrome google-chrome-stable | head -1)`.
   Pass it to the script.
3. None: stop, and hand back the no-demo block.

**ffmpeg**: the environment's, else the one `ffmpeg-static` downloaded. If it does not run,
screenshots take the place of the GIF.

```console
$ ffmpeg=$(command -v ffmpeg || node -p "require('$demo/node_modules/ffmpeg-static')") && "$ffmpeg" -version | head -1
```

## 3. Record

Start `./skill-atlas serve --port 0` in the background, from the checkout. It prints
`Skill Atlas web view: <url>`. Write a script in another new directory, and run it as
`node <script> "$demo" <url> "$demo/out" [<browser>]`. It does what the issue describes, on
`./fixture`, at a pace a person can follow: typing with a delay, a pause of 1–2 seconds after each
step, 10–30 seconds in all. After each pause it takes a screenshot, for when there is no ffmpeg.
For example, the filter:

```js
import { createRequire } from 'node:module';
const [modules, url, out, executablePath] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/`)('playwright');
const size = { width: 1280, height: 720 };
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport: size, recordVideo: { dir: out, size } });
const page = await context.newPage();
let shots = 0;
const pause = async (ms = 1500) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${out}/${++shots}.png` }); };
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

Stop the server.

## 4. The GIF

10 frames a second, 960 pixels wide. Keep it under 5 MB: make it shorter, or use fewer frames or
fewer pixels. With no ffmpeg, use the screenshots `$demo/out/1.png`, `2.png` and so on.

```console
$ "$ffmpeg" -i <video>.webm -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" "$demo/demo.gif"
$ "$ffmpeg" -ss 5 -i <video>.webm -frames:v 1 "$demo/frame.png"
```

Look at a frame or two. The change must be on screen, and nothing else may be: no tokens, no
other repositories, no paths outside the checkout.

## 5. Publish

On the branch `demos`. It has only demos, shares no history with `main` and is never merged. CI
runs on every push, and this branch has no code, so every commit message says `[skip ci]`.

```console
$ git fetch origin demos:demos || git branch demos "$(git commit-tree "$(git hash-object -w -t tree /dev/null)" -m 'Demos of pull requests [skip ci]')"
$ git worktree add "$demo/branch" demos
$ cp "$demo/demo.gif" "$demo/branch/<sha>.gif"    # or each screenshot: <sha>-1.png, <sha>-2.png, …
$ git -C "$demo/branch" add -A && git -C "$demo/branch" commit -m "Demo of <sha> [skip ci]"
$ git -C "$demo/branch" push origin demos && git -C "$demo/branch" rev-parse HEAD
$ git worktree remove "$demo/branch"
```

If the push is rejected, another demo came first: `git -C "$demo/branch" pull --rebase origin demos`,
then push again.

## 6. The blocks

**The demo block.** Link the GIF at the `demos` commit, so it always shows this demo.
`<owner>/<repo>` is `gh repo view --json nameWithOwner --jq .nameWithOwner`. With screenshots, add
one image line for each, saying what it shows. For a change in what `scan` prints, the block has
the command and its output in a `console` block in place of the image. Run that at the commit, on
`./fixture` or on what the issue names.

```markdown
### Demo of <sha>

<What it shows, in one sentence.>

![Demo: <what it shows>](https://raw.githubusercontent.com/<owner>/<repo>/<demos commit>/<sha>.gif)
```

**The no-demo block**, when any step failed: the browser, the recording, the GIF or the push.

````markdown
### No demo of <sha>

Recording failed at <the step>: <what happened, in one sentence>.

```text
<the command that failed, and the last 10 lines it printed at most; no tokens>
```

<What would make it work. For example, Chromium in the environment: `npx playwright install --with-deps chromium` in its startup script.>
````
