#!/bin/bash
# WalletLens Posting Agent — Local Runner
#
# Usage:
#   ./promo/run-agent.sh              # Dry run all platforms
#   ./promo/run-agent.sh live         # Live run all platforms
#   ./promo/run-agent.sh live devto   # Live run only Dev.to
#   ./promo/run-agent.sh dry github   # Dry run only GitHub
#
# Prerequisites:
#   export GH_TOKEN=ghp_xxx
#   export DEVTO_API_KEY=xxx        (optional)
#   export REDDIT_CLIENT_ID=xxx     (optional)
#   export REDDIT_CLIENT_SECRET=xxx (optional)
#   export REDDIT_USERNAME=xxx      (optional)
#   export REDDIT_PASSWORD=xxx      (optional)

set -e
cd "$(dirname "$0")/.."

MODE="${1:-dry}"
PLATFORM="${2:-}"
SCHEDULE="${3:-daily}"

ARGS="--schedule=$SCHEDULE"

if [ "$MODE" = "dry" ] || [ -z "$MODE" ]; then
  ARGS="$ARGS --dry-run"
fi

if [ -n "$PLATFORM" ]; then
  ARGS="$ARGS --platform=$PLATFORM"
fi

echo "Running: node promo/agent-post-all.mjs $ARGS"
node promo/agent-post-all.mjs $ARGS
