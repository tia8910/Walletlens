#!/usr/bin/env bash
# Store the optimized SNIP-20 wasm on-chain and print the resulting CODE_ID.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

ART="artifact/contract.wasm.gz"
[ -f "$ART" ] || { echo "Missing $ART — run ./scripts/bootstrap.sh first." >&2; exit 1; }

echo "==> Uploading $ART to $CHAIN_ID as key '$DEPLOYER_KEY'"
TXHASH="$(secretcli tx compute store "$ART" \
  --from "$DEPLOYER_KEY" \
  --chain-id "$CHAIN_ID" --node "$NODE" \
  --gas "$TX_GAS" --fees "$TX_FEES" \
  -y --output json | python3 -c 'import sys,json;print(json.load(sys.stdin)["txhash"])')"

echo "==> tx: $TXHASH  (waiting for inclusion...)"
sleep 8

CODE_ID="$(secretcli q tx "$TXHASH" --chain-id "$CHAIN_ID" --node "$NODE" --output json \
  | python3 -c '
import sys,json
d=json.load(sys.stdin)
for log in d.get("logs",[]):
    for ev in log.get("events",[]):
        for a in ev.get("attributes",[]):
            if a.get("key")=="code_id":
                print(a["value"]); sys.exit(0)
print("",end="")')"

if [ -z "$CODE_ID" ]; then
  echo "Could not parse code_id. Inspect: secretcli q tx $TXHASH --node $NODE" >&2
  exit 1
fi

echo
echo "==> CODE_ID = $CODE_ID"
echo "    Paste it into scripts/env.sh (export CODE_ID=\"$CODE_ID\"), then run ./scripts/instantiate.sh"
