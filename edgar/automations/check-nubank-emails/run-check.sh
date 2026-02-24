#!/bin/bash

set -uo pipefail

BASE="/home/ubuntu/openclaw/edgar/automations/check-nubank-emails"
LOG="$BASE/cron.log"
TMP="/tmp/nubank-error.log"

# parse de flags
VERBOSE=0
for arg in "$@"; do
  case $arg in
    -v|--verbose) VERBOSE=1 ;;
  esac
done

cd "$BASE" || exit 1

set -a
source .env
set +a

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
  echo "[$(date)] ERROR: DISCORD_WEBHOOK_URL não definido" >> "$LOG"
  exit 1
fi

: > "$TMP"

if [ "${TEST_ERROR:-0}" = "1" ]; then
  NODE_CMD="bash -c 'echo \"erro simulado: connection refused\" >&2; exit 1'"
else
  NODE_CMD="/usr/bin/node check-nubank-emails.mjs"
fi

if [ "$VERBOSE" = "1" ]; then
  if ! eval "$NODE_CMD" 2> >(tee "$TMP" >&2); then
    STATUS=$?
  else
    STATUS=0
  fi
else
  if ! eval "$NODE_CMD" > /dev/null 2> "$TMP"; then
    STATUS=$?
  else
    STATUS=0
  fi
fi

if [ "$STATUS" -ne 0 ] || [ -s "$TMP" ]; then
    ERROR=$(tail -c 1500 "$TMP")
    HOST=$(hostname)

    echo "[$(date)] ERROR (code=$STATUS): $ERROR" >> "$LOG"

    PAYLOAD=$(jq -n \
      --arg msg "🚨 [$HOST] Nubank Check Error (code=$STATUS)\n\n$ERROR" \
      '{content: $msg}')

    curl -s -H "Content-Type: application/json" \
         -X POST \
         -d "$PAYLOAD" \
         "$DISCORD_WEBHOOK_URL" > /dev/null
else
    echo "[$(date)] OK" >> "$LOG"
fi

rm -f "$TMP"
