#!/usr/bin/env bash
# Create a viewing key for the deployer so its (private) $LENZ balance can be read.
# In SNIP-20, balances are encrypted; a viewing key (or a signed permit) is required
# to read your own balance. This is the whole point of a privacy token.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${CONTRACT_ADDR:-}" ] || { echo "Set CONTRACT_ADDR in scripts/env.sh first." >&2; exit 1; }

ENTROPY="$(head -c 32 /dev/urandom | base64)"
echo "==> Requesting a viewing key on $CONTRACT_ADDR"

TXHASH="$(secretcli tx compute execute "$CONTRACT_ADDR" \
  "{\"create_viewing_key\":{\"entropy\":\"$ENTROPY\"}}" \
  --from "$DEPLOYER_KEY" \
  --chain-id "$CHAIN_ID" --node "$NODE" \
  --gas "$TX_GAS" --fees "$TX_FEES" \
  -y --output json | python3 -c 'import sys,json;print(json.load(sys.stdin)["txhash"])')"

echo "==> tx: $TXHASH  (waiting...)"
sleep 8

KEY="$(secretcli q compute tx "$TXHASH" --chain-id "$CHAIN_ID" --node "$NODE" --output json 2>/dev/null \
  | python3 -c '
import sys,json
d=json.load(sys.stdin)
ans=d.get("output_data_as_string") or d.get("answer") or ""
try:
    j=json.loads(ans); print(j.get("create_viewing_key",{}).get("key",""))
except Exception:
    print("")')"

if [ -n "$KEY" ]; then
  echo
  echo "==> VIEWING_KEY = $KEY"
  echo "    Paste it into scripts/env.sh (export VIEWING_KEY=\"$KEY\"), then ./scripts/query-balance.sh"
else
  echo "Could not auto-parse the key. Decrypt manually:" >&2
  echo "  secretcli q compute tx $TXHASH --node $NODE" >&2
fi
