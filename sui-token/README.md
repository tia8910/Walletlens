# $LENZ — the native token of walletlens.live (Sui)

**$LENZ is the native token of [walletlens.live](https://walletlens.live)** — a 100%
free, no-account, privacy-first all-asset portfolio tracker for crypto, stocks,
precious metals, fiat and real estate, with AI insights and live prices, where all
your data stays on your device.

$LENZ is a **standard Sui `coin`** with a **low, hard cap of 10,000,000**, **0%
insider/team allocation**, and **supply locked forever** by freezing the TreasuryCap
at publish. You **earn it by using and sharing the app**; reward & reserve tokens are
released over time from a transparent, time-locked schedule. It is the
utility/governance token of the WalletLens ecosystem.

> **Honest framing.** Sui is a public chain: balances and transfers are visible on a
> block explorer. $LENZ is therefore the **native/utility token of a privacy-first
> app**, not a "privacy coin." The privacy is in the *product* (your portfolio data
> never leaves your device), not in the token's on-chain transfers.

## Why Sui
- Large, fast-growing ecosystem; **easy to buy** (Cetus/Turbos/BlueMove/DeepBook +
  aggregators) and **easy to list** (CoinGecko/CoinMarketCap applications are free).
- Fast, parallel execution and very low fees.
- **Move** language with a safe object model; the coin module is tiny and standard.
- Mainstream wallets: **Sui Wallet, Suiet, Slush**.

## What's in here
```
sui-token/
  Move.toml
  sources/
    lenz.move                # the coin module: mint 10M once, then freeze the cap
    airdrop.move             # Merkle claim contract (trustless airdrop payout)
  scripts/
    publish.sh               # build + publish (runs init: mint + freeze)
    distribute.sh            # split & send the allocations (no vesting)
    verify-onchain.sh        # "don't trust, verify" PASS/FAIL report
    build-merkle.mjs         # snapshot CSV → Merkle root + per-address proofs
    env.example.sh           # copy to env.sh and fill in
  TOKENOMICS.md              # 10M hard cap, 0% insiders, use-&-earn distribution
  LAUNCH.md                  # ordered launch runbook + cost & liquidity
  AIRDROP.md                 # Merkle airdrop: snapshot → publish → users claim
```
`build/`, `publish-output.json` and `scripts/env.sh` are git-ignored.

## Prerequisites
- **Sui CLI** — https://docs.sui.io/guides/developer/getting-started/sui-install
- A Sui address with a little **SUI for gas** (testnet from the faucet:
  https://faucet.sui.io / `sui client faucet`).

## Quick start (testnet)
```bash
cd sui-token
cp scripts/env.example.sh scripts/env.sh   # then edit it
chmod +x scripts/*.sh

sui client faucet                 # testnet gas
./scripts/publish.sh              # mints 10M to you, freezes the cap; prints ids
#  → paste PACKAGE_ID / TREASURY_CAP_ID / METADATA_ID / SUPPLY_COIN_ID into env.sh
./scripts/verify-onchain.sh       # confirm supply + frozen cap
./scripts/distribute.sh           # send the 50/35/15 allocations
```

## Legitimacy — don't trust, verify
Everything is verifiable on-chain (`./scripts/verify-onchain.sh`):
- **Fixed supply** — total supply = 10,000,000 LENZ.
- **Minting locked forever** — the TreasuryCap object is **Immutable (frozen)**, so
  `coin::mint` can never be called again by anyone.
- **No insider bag** — 0% to team/VCs; reward & reserve tokens are time-locked and
  released on a public schedule; distribution wallets are published.
- **Immutable metadata** — name/symbol/decimals/icon are frozen.
- **No admin / no upgrade hook** — the module has no mint authority that survives
  publish and no special logic to abuse.

> **Anti-phishing:** the only official $LENZ package id and coin type live on
> **https://walletlens.live/lenz** and in this repo. WalletLens never DMs you, never
> runs a "claim/connect-wallet" site, and never asks for your seed phrase.
