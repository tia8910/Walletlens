#!/usr/bin/env bash
# Remove the admin rug vector after launch by handing the contract admin to a
# published multisig (recommended) or renouncing it. With mint already disabled,
# the admin cannot inflate supply — this closes the remaining trust gap.
#
# Usage:
#   ./scripts/renounce-admin.sh secret1yourmultisig...   # transfer admin to a multisig
#   ./scripts/renounce-admin.sh --renounce               # set admin to none, if supported
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

[ -n "${CONTRACT_ADDR:-}" ] || { echo "Set CONTRACT_ADDR in scripts/env.sh first." >&2; exit 1; }
[ $# -eq 1 ] || { echo "Usage: $0 <new_admin_address> | --renounce" >&2; exit 1; }

if [ "$1" = "--renounce" ]; then
  MSG='{"change_admin":{"address":null}}'
  echo "==> Renouncing admin on $CONTRACT_ADDR (setting admin to none)"
  echo "    NOTE: not all SNIP-20 builds accept a null admin. If this fails, hand admin"
  echo "          to a published multisig instead: $0 <multisig_address>"
else
  NEW_ADMIN="$1"
  case "$NEW_ADMIN" in secret1*) ;; *) echo "Refusing: '$NEW_ADMIN' is not a secret1 address." >&2; exit 1;; esac
  MSG="{\"change_admin\":{\"address\":\"$NEW_ADMIN\"}}"
  echo "==> Transferring admin of $CONTRACT_ADDR to $NEW_ADMIN"
fi

echo "    This is IRREVERSIBLE from the current admin key. Ctrl-C within 5s to abort."
sleep 5

secretcli tx compute execute "$CONTRACT_ADDR" "$MSG" \
  --from "$DEPLOYER_KEY" \
  --chain-id "$CHAIN_ID" --node "$NODE" \
  --gas "$TX_GAS" --fees "$TX_FEES" -y

echo
echo "==> Done. Verify with: ./scripts/verify-onchain.sh   (check the [4] Admin line)"
