#!/usr/bin/env bash
# Post a message to the #sasha-max Slack channel.
# Usage: send.sh "message text"   (or pipe the text on stdin)
set -euo pipefail

CHANNEL="#sasha-max"

if [[ -z "${SLACK_BOT_TOKEN:-}" ]]; then
  echo "error: SLACK_BOT_TOKEN is not set" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  TEXT="$*"
else
  TEXT="$(cat)"
fi

if [[ -z "$TEXT" ]]; then
  echo "error: empty message" >&2
  exit 1
fi

PAYLOAD="$(CHANNEL="$CHANNEL" TEXT="$TEXT" python3 -I -c \
  'import json,os;print(json.dumps({"channel":os.environ["CHANNEL"],"text":os.environ["TEXT"]}))')"

RESPONSE="$(curl -sS https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-type: application/json; charset=utf-8" \
  --data-binary "$PAYLOAD")"

echo "$RESPONSE" | python3 -I -c '
import json, sys
d = json.load(sys.stdin)
if d.get("ok"):
    print("sent: channel=%s ts=%s" % (d.get("channel"), d.get("ts")))
else:
    print("error: %s" % d.get("error"), file=sys.stderr)
    sys.exit(1)
'
