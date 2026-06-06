#!/usr/bin/env bash
# "Don't trust, verify." Independently checks the deployed $LENZ contract against the
# audited reference build and the published tokenomics, then prints a PASS/FAIL report.
# Anyone can run this — it only performs read-only queries.
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${CONTRACT_ADDR:-}" ] || { echo "Set CONTRACT_ADDR in scripts/env.sh first." >&2; exit 1; }

pass=0; fail=0
ok()   { echo "  ✅ $1"; pass=$((pass+1)); }
bad()  { echo "  ❌ $1"; fail=$((fail+1)); }
note() { echo "  •  $1"; }

echo "Verifying \$LENZ at $CONTRACT_ADDR on $CHAIN_ID"
echo

# 1) Code hash matches the locally built audited artifact -----------------------
echo "[1] Bytecode == audited reference build"
ONCHAIN_HASH="$(secretcli q compute contract-hash-by-contract-address "$CONTRACT_ADDR" \
  --node "$NODE" 2>/dev/null | tr -d '\r' | sed 's/^0x//' | tr 'A-F' 'a-f')"
if [ -f artifact/contract.wasm.gz ]; then
  LOCAL_HASH="$(gunzip -c artifact/contract.wasm.gz | sha256sum | awk '{print $1}')"
  if [ -n "$ONCHAIN_HASH" ] && [ "$ONCHAIN_HASH" = "$LOCAL_HASH" ]; then
    ok "on-chain code hash matches local audited build ($ONCHAIN_HASH)"
  else
    bad "code hash mismatch — on-chain=$ONCHAIN_HASH local=$LOCAL_HASH"
  fi
elif [ -n "${EXPECTED_CODE_HASH:-}" ]; then
  EXP="$(echo "$EXPECTED_CODE_HASH" | sed 's/^0x//' | tr 'A-F' 'a-f')"
  [ "$ONCHAIN_HASH" = "$EXP" ] && ok "code hash matches EXPECTED_CODE_HASH" \
    || bad "code hash mismatch — on-chain=$ONCHAIN_HASH expected=$EXP"
else
  note "no local artifact and no EXPECTED_CODE_HASH set; on-chain hash=$ONCHAIN_HASH"
  note "run ./scripts/bootstrap.sh to build the audited artifact, then re-run."
fi

# 2) Fixed supply: minting disabled --------------------------------------------
echo "[2] Minting permanently disabled"
MINTERS="$(secretcli q compute query "$CONTRACT_ADDR" '{"minters":{}}' --node "$NODE" 2>/dev/null)"
if echo "$MINTERS" | grep -q '"minters":[[:space:]]*\[[[:space:]]*\]'; then
  ok "no minters — supply cannot be inflated"
elif echo "$MINTERS" | grep -qi 'minters'; then
  bad "minters present — investigate: $MINTERS"
else
  note "could not read minters (query may be unsupported on this build): $MINTERS"
fi

# 3) Token info: cap / symbol / decimals ---------------------------------------
echo "[3] Token info"
TI="$(secretcli q compute query "$CONTRACT_ADDR" '{"token_info":{}}' --node "$NODE" 2>/dev/null)"
echo "    $TI"
echo "$TI" | grep -q '"symbol":"LENZ"' && ok "symbol = LENZ" || bad "symbol is not LENZ"
if echo "$TI" | grep -q '"total_supply":"21000000000000"'; then
  ok "total supply = 21,000,000 LENZ (matches published cap)"
elif echo "$TI" | grep -q 'total_supply'; then
  bad "total_supply differs from the published 21,000,000 LENZ cap"
else
  note "total_supply is private on this token (public_total_supply=false)"
fi

# 4) Admin (rug vector) --------------------------------------------------------
echo "[4] Admin key"
CI="$(secretcli q compute contract-info "$CONTRACT_ADDR" --node "$NODE" 2>/dev/null)"
ADMIN="$(echo "$CI" | grep -oE '"admin":"[^"]*"' | head -1 | sed 's/.*://; s/"//g')"
if [ -z "$ADMIN" ] || echo "$ADMIN" | grep -qiE 'null|none'; then
  ok "no contract admin (renounced)"
else
  note "admin = $ADMIN — confirm this is the PUBLISHED multisig, not a single hot wallet"
fi

echo
echo "──────────────────────────────────────────"
echo "  PASS: $pass    FAIL: $fail"
[ "$fail" -eq 0 ] && echo "  Result: ✅ all automated checks passed" \
                  || echo "  Result: ❌ review the failures above"
echo "──────────────────────────────────────────"
[ "$fail" -eq 0 ]
