#!/usr/bin/env bash
# Instantiate $LENZ from an uploaded CODE_ID using the chosen init config.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${CODE_ID:-}" ] || { echo "Set CODE_ID in scripts/env.sh (from ./scripts/upload.sh)." >&2; exit 1; }
[ -f "$INIT_CONFIG" ] || { echo "Init config not found: $INIT_CONFIG" >&2; exit 1; }

# Guard against deploying with un-filled placeholders.
if grep -q "REPLACE_WITH" "$INIT_CONFIG"; then
  echo "ERROR: $INIT_CONFIG still contains REPLACE_WITH_ placeholders." >&2
  echo "       Fill in admin, prng_seed (base64), and initial_balances addresses first." >&2
  echo "       Generate a seed e.g.:  head -c 32 /dev/urandom | base64" >&2
  exit 1
fi

INIT_MSG="$(cat "$INIT_CONFIG")"
echo "==> Instantiating code $CODE_ID on $CHAIN_ID with label '$LABEL'"

TXHASH="$(secretcli tx compute instantiate "$CODE_ID" "$INIT_MSG" \
  --from "$DEPLOYER_KEY" --label "$LABEL" \
  --chain-id "$CHAIN_ID" --node "$NODE" \
  --gas "$TX_GAS" --fees "$TX_FEES" \
  -y --output json | python3 -c 'import sys,json;print(json.load(sys.stdin)["txhash"])')"

echo "==> tx: $TXHASH  (waiting...)"
sleep 8

ADDR="$(secretcli q compute list-contract-by-code "$CODE_ID" --chain-id "$CHAIN_ID" --node "$NODE" --output json \
  | python3 -c 'import sys,json;rows=json.load(sys.stdin);print(rows[-1]["contract_address"] if rows else "")')"

echo
echo "==> $LENZ contract address: $ADDR"
echo "    Paste it into scripts/env.sh (export CONTRACT_ADDR=\"$ADDR\")."
echo "    Verify token info: secretcli q compute query $ADDR '{\"token_info\":{}}' --node $NODE"
