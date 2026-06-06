#!/usr/bin/env bash
# Distribute the fixed supply to the allocation wallets (100% liquid, no vesting).
# Splits the single supply Coin<LENZ> and sends each allocation in one PTB.
# Amounts are in base units (6 decimals).
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${SUPPLY_COIN_ID:-}" ] || { echo "Set SUPPLY_COIN_ID in scripts/env.sh (from publish)." >&2; exit 1; }
for v in ADDR_COMMUNITY ADDR_LIQUIDITY ADDR_TREASURY; do
  [ -n "${!v:-}" ] || { echo "Set $v in scripts/env.sh." >&2; exit 1; }
done

COMMUNITY=5000000000000   # 5,000,000 LENZ
LIQUIDITY=3500000000000    #  3,500,000 LENZ
TREASURY=1500000000000     #  1,500,000 LENZ

echo "==> Distributing from $SUPPLY_COIN_ID on $NETWORK"
echo "    Community $COMMUNITY → $ADDR_COMMUNITY"
echo "    Liquidity $LIQUIDITY → $ADDR_LIQUIDITY"
echo "    Treasury  $TREASURY → $ADDR_TREASURY"
echo "    Ctrl-C within 5s to abort."; sleep 5

# `sui client pay` splits the input coin and pays each recipient the matching amount;
# the remainder (here: 0) stays with the sender.
sui client pay \
  --input-coins "$SUPPLY_COIN_ID" \
  --recipients "$ADDR_COMMUNITY" "$ADDR_LIQUIDITY" "$ADDR_TREASURY" \
  --amounts "$COMMUNITY" "$LIQUIDITY" "$TREASURY" \
  --gas-budget 50000000

echo "==> Done. Verify balances on a Sui explorer, then ./scripts/verify-onchain.sh"
