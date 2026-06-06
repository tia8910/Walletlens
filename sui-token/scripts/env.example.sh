# Copy to env.sh and fill in. env.sh is git-ignored.
#   cp scripts/env.example.sh scripts/env.sh

# Network: testnet (recommended first) or mainnet.
export NETWORK="testnet"

# Full-node JSON-RPC endpoint (verify script uses this).
export RPC="https://fullnode.testnet.sui.io:443"
# Mainnet: export RPC="https://fullnode.mainnet.sui.io:443"

# --- Filled in after ./scripts/publish.sh ------------------------------------
# The published package id (0x...):
export PACKAGE_ID=""
# The coin type = <PACKAGE_ID>::lenz::LENZ  (verify.sh builds it from PACKAGE_ID)
# The frozen TreasuryCap object id (proves minting is locked):
export TREASURY_CAP_ID=""
# The frozen CoinMetadata object id:
export METADATA_ID=""
# The Coin<LENZ> object id holding the full supply (input to distribute.sh):
export SUPPLY_COIN_ID=""

# --- Distribution (100% liquid at genesis, no unlocks) -----------------------
# Base units (6 decimals): 1 LENZ = 1_000_000.
#   Community 50% = 10,500,000 LENZ = 10500000000000
#   Liquidity 35% =  7,350,000 LENZ =  7350000000000
#   Treasury  15% =  3,150,000 LENZ =  3150000000000
export ADDR_COMMUNITY=""
export ADDR_LIQUIDITY=""
export ADDR_TREASURY=""
