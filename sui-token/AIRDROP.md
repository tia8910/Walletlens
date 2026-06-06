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

## Step 1 — Make the snapshot
A CSV with one row per eligible wallet, amount in **base units** (1 LENZ = 1,000,000):
```csv
address,amount
0x<64hex>,500000        # 0.5 LENZ
0x<64hex>,21000000      # 21 LENZ (example per-wallet cap ≈ 0.1% would be 21,000 LENZ = 21000000000)
```
Apply your **per-wallet cap** here (no wallet over the cap) and de-dupe addresses (the
tool rejects duplicates).

## Step 2 — Build the tree
```bash
cd sui-token
node scripts/build-merkle.mjs snapshot.csv airdrop-out
```
Outputs `airdrop-out/root.txt`, `proofs.json`, `summary.json`. **`summary.json` tells you
the exact total to fund** the airdrop with.

## Step 3 — Create the airdrop on-chain
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

## Step 4 — Users claim
Each eligible wallet looks up its `{ amount, proof }` in `proofs.json` and calls:
```
package: <PACKAGE_ID>  module: airdrop  function: claim
args: <AIRDROP_OBJECT_ID>, <amount>, <proof: vector<vector<u8>>>
```
Passing `vector<vector<u8>>` is awkward on the bare CLI, so claims are best done from a
small **claim button on `/airdrop`** (Sui dApp-kit) or a tiny SDK script that reads
`proofs.json`. (Ask Claude to wire the `/airdrop` claim button when you're ready — it
needs the live `PACKAGE_ID` + `AIRDROP_OBJECT_ID`.)

## Step 5 — After the campaign
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
