# Copy to env.sh and fill in. env.sh is git-ignored.
#   cp scripts/env.example.sh scripts/env.sh

# --- Network -----------------------------------------------------------------
# Testnet (pulsar-3) is the default and is strongly recommended first.
export CHAIN_ID="pulsar-3"
export NODE="https://pulsar.lcd.secretnodes.com"
# Mainnet (uncomment to use secret-4):
# export CHAIN_ID="secret-4"
# export NODE="https://lcd.mainnet.secretsaturn.net"

# --- Deployer ----------------------------------------------------------------
# Name of the secretcli key that pays for / signs the deploy.
export DEPLOYER_KEY="deployer"
export TX_GAS="3000000"
export TX_FEES="60000uscrt"

# --- Which config to instantiate with ----------------------------------------
# Path is relative to the lenz-token/ directory.
export INIT_CONFIG="config/instantiate.testnet.json"

# --- Filled in as you go -----------------------------------------------------
# After ./scripts/upload.sh prints a code id, paste it here:
export CODE_ID=""
# After ./scripts/instantiate.sh prints the contract address, paste it here:
export CONTRACT_ADDR=""
# A label must be globally unique on the chain. Bump if instantiate says "exists".
export LABEL="lenz-walletlens-v1"
# Viewing key used by create-viewing-key.sh / query-balance.sh:
export VIEWING_KEY=""
# Optional: expected on-chain code hash (sha256 of the uncompressed wasm) so
# verify-onchain.sh can check legitimacy without a local build. Printed by
# ./scripts/bootstrap.sh as "code hash (uncompressed wasm)".
export EXPECTED_CODE_HASH=""
