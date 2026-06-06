# $LENZ Airdrop Registration API

A tiny backend (Deno Deploy + Deno KV) that collects **validated** airdrop
registrations. It is the only part of WalletLens that stores data on a server —
a deliberate, scoped exception for the airdrop. The core app stays data-free.

## How a wallet is validated
1. **Ownership (signature):** the user signs a fixed message with their Sui wallet;
   the API verifies the signature resolves to that exact address. You cannot
   register a wallet you don't control.
2. **On-chain gate:** the API checks the wallet has ≥ `MIN_TX` prior outgoing
   transactions — fresh, zero-history throwaway wallets are marked **not eligible**.
3. **De-dup + IP flag:** one record per address; registrations are grouped by a
   salted IP hash, and clusters (≥5 wallets/IP) get `ipFlag` for review.
4. **Flat payout:** final allocation is equal-per-wallet + capped (see `sui-token/`),
   so any sybil that slips through earns ~nothing.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | `{ address, signature, quests[], referredBy?, xHandle? }` → validate + store |
| GET | `/status?address=0x…` | a wallet's registration record |
| GET | `/stats` | `{ total, eligible }` (for the page counter) |
| GET | `/export` | `Authorization: Bearer <ADMIN_TOKEN>` → CSV of eligible addresses |

## Deploy (Deno Deploy)
1. Push this repo (you already use Deno Deploy for `voice-api/`).
2. New Deno Deploy project → entrypoint `airdrop-api/main.ts`.
3. Set env vars:
   - `SUI_RPC` = `https://fullnode.mainnet.sui.io:443` (or testnet)
   - `MIN_TX` = `1` (min prior txns to be eligible; `0` disables the gate)
   - `ADMIN_TOKEN` = a long random secret (protects `/export`)
   - `IP_SALT` = any random string (privacy for IP hashing)
   - `ALLOWED_ORIGIN` = `https://walletlens.live`
   Deno KV is enabled automatically — no database to provision.
4. Note the deployed URL (e.g. `https://lenz-airdrop.deno.dev`) → the `/airdrop`
   page calls it.

## From registrations to the on-chain airdrop
```
/export (eligible addresses)  →  candidates.csv
  → node sui-token/scripts/prepare-snapshot.mjs candidates.csv --pool 3000000   (gate + flat alloc)
  → node sui-token/scripts/build-merkle.mjs snapshot.csv                          (root + proofs)
  → sui client call ... airdrop::create (root)                                    (fund on-chain)
  → users claim on /airdrop
```

## Notes
- The signed message must match `signMessage()` exactly on both sides.
- Points/quests are for tiers/engagement; they do **not** set token amounts
  (allocation is flat), which removes the incentive to fake quests.
- Local dev: `deno run --unstable-kv --allow-net --allow-env main.ts`.
