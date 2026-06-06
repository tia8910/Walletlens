# $LENZ Launch Runbook (Sui)

Ordered steps to launch $LENZ — the native token of [walletlens.live](https://walletlens.live)
— on Sui, safely and credibly.

> Legend: 🟢 do yourself · 🔴 irreversible

## Phase 0 — Decide
- 🟢 Confirm params (already set): **21,000,000 hard cap, 6 decimals, no unlocks**,
  distribution Community 50% / Liquidity 35% / Treasury 15%.
- 🟢 Make the **treasury a multisig** if possible.

## Phase 1 — Testnet dry run
- 🟢 `sui client switch --env testnet && sui client faucet`
- 🟢 `./scripts/publish.sh` → mints 21M to you, **freezes the TreasuryCap**.
- 🟢 Fill ids in `scripts/env.sh`; `./scripts/verify-onchain.sh` → clean PASS.
- 🟢 `./scripts/distribute.sh` to test wallets; confirm balances on an explorer.

## Phase 2 — Mainnet 🔴
- 🟢 In `Move.toml` switch the framework rev to `framework/mainnet`; set
  `NETWORK=mainnet`, `RPC=https://fullnode.mainnet.sui.io:443` in `env.sh`.
- 🔴 `./scripts/publish.sh` — supply is minted and the cap is **frozen forever**.
- 🟢 `./scripts/verify-onchain.sh` → PASS, then `./scripts/distribute.sh`.

## Phase 3 — Liquidity
- 🟢 Create a $LENZ pool on a Sui DEX (**Cetus / Turbos / BlueMove / DeepBook**)
  paired with SUI or USDC; seed from the Liquidity allocation.
- 🔴 **Lock the LP** (or send LP to a timelock/burn) so it can't be pulled.

## Phase 4 — Publish proof & go live
- 🟢 Publish on `/lenz` and in `README.md`: **package id**, **coin type**, the
  **frozen TreasuryCap id**, distribution wallets, and the LP-lock link.
- 🟢 Paste the `verify-onchain.sh` PASS report publicly.
- 🟢 Enable the gated entry in `client/src/data/trackCoins.js` once a real price exists.

## Phase 5 — Discoverability & community
- 🟢 Apply to **CoinGecko** and **CoinMarketCap** (free) once there are a few days of
  trading volume and some liquidity.
- 🟢 **Airdrop via a claim (Merkle) approach, not mass sends:** publish a snapshot +
  proof root once; users claim their own allocation and pay their own gas. Apply a
  **per-wallet cap** (≈0.1% of supply) so no whale forms, and **phase** it (snapshot
  batch first, then quests/referrals, then ongoing rewards). See TOKENOMICS.md for the
  users-heavy sub-split (30% early users / 12.5% quests / 7.5% ongoing).
- 🟢 Pin the official package id + coin type + anti-phishing notice everywhere.

---

## Cost & liquidity (honest)
- **Publish + distribute + freeze:** a few dollars of SUI gas total.
- **Tooling, site, deploy, verify scripts:** free.
- **CoinGecko / CoinMarketCap application:** free (they require some liquidity +
  trading volume; more liquidity = faster listing).
- **Liquidity is capital you keep (your LP), not a fee.** Suggested ranges:
  ~$50–$300 (thin, volatile), ~$500–$2k (starter), $2k+ (comfortable depth).

### Low-budget launch (≈ a few dollars)
You do **not** need a big budget to launch — only to have *deep* liquidity.
1. 🟢 Publish on mainnet (a few $ of SUI) → a real, supply-locked token.
2. 🟢 **Airdrop** a chunk to the community first to create holders and organic demand.
3. 🟢 Seed a **small pool with whatever you can** ($50–$200) and **lock the LP**.
4. 🟢 Apply to CoinGecko/CMC once there's a few days of trading.
5. 🟢 Grow liquidity later from the treasury or trading fees as the community grows.

> Lowest-capital alternative: a Sui **fair-launch / bonding-curve launchpad** lets
> buyers fund liquidity instead of you — but it reads as speculative/memecoin, which
> works against the "serious, legit project" goal. The standard coin in this repo,
> plus the verifiable `/lenz` page, is the more credible route.

## Anti-scam hygiene
- One canonical package id + coin type, published everywhere you control.
- Never DM holders; never run a "connect wallet to claim" site; never ask for seed
  phrases. Report impersonator coins/sites.
