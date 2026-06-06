# $LENZ Merkle Airdrop — claim-based, no backend

Distribute the 50% airdrop pool **without mass sends and without a server**: publish
one Merkle root, and eligible users **claim their own $LENZ** (paying their own gas).

Pieces:
- **`sources/airdrop.move`** — the on-chain claim contract (same package as the coin).
- **`scripts/build-merkle.mjs`** — turns a snapshot CSV into the root + per-address proofs.

> ⚠️ **UNAUDITED.** The claim contract is security-sensitive (it custodies the airdrop
> funds). Test the full flow on **testnet** and get a review before mainnet.

## Hashing scheme (the two sides must match — they do)
```
leaf = sha256( address_bytes(32) || amount_as_8_little_endian_bytes )
node = sha256( sort(left, right) )     # OpenZeppelin-style sorted pairs
```
Odd nodes are carried up unchanged; proofs are position-independent. `build-merkle.mjs`
and `airdrop.move` implement this identically (verified: every generated proof folds
back to the root).

## Anti-sybil model (no backend needed)
You can't fully stop someone making many wallets, so we make it **uneconomic** and
**filter throwaway wallets**:
- **On-chain gating** — only wallets with real prior Sui activity qualify (fresh,
  zero-history farm wallets are dropped).
- **Flat allocation** — the pool is split **equally** among survivors, so 10 wallets
  ≈ 10× the gas/effort for ~no extra reward.
- **Hard per-wallet cap** — enforced in tooling so no address is over-allocated.

## Step 1 — Candidate list
A CSV with one Sui address per line (header/extra columns ignored):
```csv
address
0x<64hex>
0x<64hex>
```

## Step 2 — Gate + flat allocation
Filters by on-chain history and splits the batch pool equally (capped):
```bash
cd sui-token
node scripts/prepare-snapshot.mjs candidates.csv --pool 6300000 --min-tx 1 --cap 21000
#   → snapshot.csv (address,amount in base units) + rejected.csv
# Use --skip-gate to test the allocation math offline.
```

## Step 3 — Build the tree
```bash
node scripts/build-merkle.mjs snapshot.csv airdrop-out   # enforces the per-wallet cap again
```
Outputs `airdrop-out/root.txt`, `proofs.json`, `summary.json`. **`summary.json` tells you
the exact total to fund** the airdrop with.

## Step 4 — Create the airdrop on-chain
You need a single `Coin<LENZ>` object holding exactly the total from `summary.json`
(split one off with `sui client split-coin` if needed), then:
```bash
ROOT=$(cat airdrop-out/root.txt)
sui client call \
  --package <PACKAGE_ID> --module airdrop --function create \
  --args <COIN_LENZ_OBJECT_ID> "$ROOT" \
  --gas-budget 50000000
```
This shares an `Airdrop` object (note its id) and sends you an `AdminCap`.

## Step 5 — Users claim
Each eligible wallet looks up its `{ amount, proof }` in `proofs.json` and calls:
```
package: <PACKAGE_ID>  module: airdrop  function: claim
args: <AIRDROP_OBJECT_ID>, <amount>, <proof: vector<vector<u8>>>
```
Passing `vector<vector<u8>>` is awkward on the bare CLI, so claims are best done from a
small **claim button on `/airdrop`** (Sui dApp-kit) or a tiny SDK script that reads
`proofs.json`. (Ask Claude to wire the `/airdrop` claim button when you're ready — it
needs the live `PACKAGE_ID` + `AIRDROP_OBJECT_ID`.)

## Step 6 — After the campaign
Recover any unclaimed balance with your AdminCap:
```bash
sui client call --package <PACKAGE_ID> --module airdrop --function sweep \
  --args <ADMIN_CAP_ID> <AIRDROP_OBJECT_ID> --gas-budget 50000000
```

## Cost
- Building the tree: free (local).
- `create`: a little SUI gas.
- Claims: each user pays their **own** gas — so distribution costs *you* almost nothing
  regardless of how many recipients there are. This is the whole point of Merkle claims.
