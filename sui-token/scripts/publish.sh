#!/usr/bin/env bash
# Build and publish the $LENZ Move package. init() runs at publish time: it mints
# the full 21,000,000 supply to you and FREEZES the TreasuryCap (minting locked
# forever). Prints the ids you need to record in scripts/env.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

command -v sui >/dev/null || { echo "Sui CLI not found. Install: https://docs.sui.io/guides/developer/getting-started/sui-install" >&2; exit 1; }

echo "==> Switching to $NETWORK and building"
sui client switch --env "$NETWORK" >/dev/null 2>&1 || true
sui move build

echo "==> Publishing (init mints 21M and freezes the TreasuryCap)"
sui client publish --gas-budget 300000000 --json > publish-output.json
echo "    Raw result saved to publish-output.json"

# Best-effort extraction of the key ids.
if command -v python3 >/dev/null; then
python3 - <<'PY'
import json
d=json.load(open("publish-output.json"))
pkg=None; cap=None; meta=None; coin=None
for c in d.get("objectChanges",[]):
    t=c.get("type")
    ot=c.get("objectType","") or ""
    if t=="published": pkg=c.get("packageId")
    if "TreasuryCap<" in ot and "::lenz::LENZ>" in ot: cap=c.get("objectId")
    if "CoinMetadata<" in ot and "::lenz::LENZ>" in ot: meta=c.get("objectId")
    if ot.endswith("::coin::Coin<%s::lenz::LENZ>"% (pkg or "")) or ("::coin::Coin<" in ot and "::lenz::LENZ>" in ot): coin=c.get("objectId")
print("\n==> Record these in scripts/env.sh:")
print("PACKAGE_ID     =", pkg)
print("TREASURY_CAP_ID=", cap, "(should be Immutable/frozen)")
print("METADATA_ID    =", meta)
print("SUPPLY_COIN_ID =", coin, "(holds the full 21,000,000 LENZ)")
print("COIN TYPE      =", (pkg or "<pkg>")+"::lenz::LENZ")
PY
else
  echo "Install python3 to auto-extract ids, or read publish-output.json manually."
fi
echo
echo "Next: fill scripts/env.sh, then ./scripts/verify-onchain.sh"
