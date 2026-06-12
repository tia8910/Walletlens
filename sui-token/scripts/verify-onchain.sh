#!/usr/bin/env bash
# "Don't trust, verify." Read-only checks that $LENZ is legit on Sui:
#   - total supply == 10,000,000 LENZ (and matches the published cap)
#   - the TreasuryCap is Immutable (frozen) → minting is permanently locked
#   - the CoinMetadata is Immutable (frozen) → name/symbol/icon can't change
# Anyone can run this; it only queries the full node.
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${PACKAGE_ID:-}" ] || { echo "Set PACKAGE_ID in scripts/env.sh first." >&2; exit 1; }
COIN_TYPE="${PACKAGE_ID}::lenz::LENZ"
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
bad(){ echo "  ❌ $1"; fail=$((fail+1)); }

rpc(){ curl -s -X POST "$RPC" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"; }

echo "Verifying \$LENZ ($COIN_TYPE) on $NETWORK"
echo

echo "[1] Total supply == 10,000,000 LENZ"
SUP="$(rpc suix_getTotalSupply "[\"$COIN_TYPE\"]" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get("value",""))' 2>/dev/null)"
echo "    on-chain base units: ${SUP:-<none>}"
[ "$SUP" = "10000000000000" ] && ok "fixed supply = 10,000,000 LENZ" || bad "supply != 10,000,000 LENZ"

check_immutable(){ # $1=objId  $2=label
  local id="$1" label="$2"
  [ -n "$id" ] || { echo "  •  $label id not set in env — skipping"; return; }
  local owner
  owner="$(rpc sui_getObject "[\"$id\",{\"showOwner\":true}]" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("result",{}).get("data",{}).get("owner",""))' 2>/dev/null)"
  echo "    $label owner: $owner"
  echo "$owner" | grep -qi 'Immutable' && ok "$label is Immutable (frozen)" || bad "$label is NOT immutable"
}

echo "[2] TreasuryCap frozen (minting locked forever)"
check_immutable "${TREASURY_CAP_ID:-}" "TreasuryCap"

echo "[3] CoinMetadata frozen (name/symbol/icon immutable)"
check_immutable "${METADATA_ID:-}" "CoinMetadata"

echo
echo "──────────────────────────────────────────"
echo "  PASS: $pass    FAIL: $fail"
[ "$fail" -eq 0 ] && echo "  Result: ✅ all automated checks passed" || echo "  Result: ❌ review failures above"
echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
