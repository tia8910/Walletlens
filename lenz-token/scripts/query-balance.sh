#!/usr/bin/env bash
# Read the deployer's private $LENZ balance using its viewing key.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${CONTRACT_ADDR:-}" ] || { echo "Set CONTRACT_ADDR in scripts/env.sh first." >&2; exit 1; }
[ -n "${VIEWING_KEY:-}" ]   || { echo "Set VIEWING_KEY in scripts/env.sh (run ./scripts/create-viewing-key.sh)." >&2; exit 1; }

ADDR="$(secretcli keys show -a "$DEPLOYER_KEY")"
echo "==> Querying private balance of $ADDR"

secretcli q compute query "$CONTRACT_ADDR" \
  "{\"balance\":{\"address\":\"$ADDR\",\"key\":\"$VIEWING_KEY\"}}" \
  --chain-id "$CHAIN_ID" --node "$NODE"
