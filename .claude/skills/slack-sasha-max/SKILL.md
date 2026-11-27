---
name: slack-sasha-max
description: Send a message to the Slack channel #sasha-max in the "AI Workshop Munich 2026" workspace. Use when the user asks to post, send, or notify something in sasha-max / the workshop Slack channel.
---

# Send a message to #sasha-max

Posts a message to `#sasha-max` in the **AI Workshop Munich 2026** Slack workspace
using the bot token in `SLACK_BOT_TOKEN` (posts appear from the bot user `air`).

## Steps

1. Determine the exact message text. If the user didn't give one, ask — don't invent it.
2. Run the bundled script (it JSON-encodes the text safely, so quotes/newlines are fine):

   ```bash
   bash .claude/skills/slack-sasha-max/send.sh "<message text>"
   ```

   For multi-line text, pipe it on stdin instead:

   ```bash
   printf '%s' "<message text>" | bash .claude/skills/slack-sasha-max/send.sh
   ```

3. Report the result. On success the script prints `sent: channel=<id> ts=<ts>`.
   On failure it prints `error: <slack error>` and exits non-zero — relay that
   (e.g. `not_in_channel`, `channel_not_found`, `invalid_auth`) instead of retrying blindly.

## Notes

- Never print or echo `SLACK_BOT_TOKEN`.
- Sending is outward-facing: only send what the user asked for, once.
