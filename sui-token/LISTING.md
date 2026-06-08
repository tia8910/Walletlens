# $LENZ Listing Kit (pre-listing readiness)

Everything needed to list $LENZ the moment it's live on Sui mainnet. You can't
list before mainnet + liquidity, but having this ready means zero delay after.

> ⚠️ No legitimate listing requires an upfront "pre-listing" fee. DEX + CoinGecko +
> CoinMarketCap are **free**. Anyone DMing "guaranteed listing for $X" is a scam.

## Listing order (after mainnet)
1. **Create the DEX pool** (Cetus / Turbos / FlowX) + **lock the LP**. This is the
   first listing — permissionless, instant.
2. **DexScreener & DexTools** auto-index the pool within minutes. Then submit their
   free "token info / update" forms to add logo, description, socials.
3. **CoinGecko** and **CoinMarketCap** — apply (free) once there are a few days of
   real volume + liquidity.
4. **CEX** (MEXC, Gate, etc.) — later, once there's community + volume.

## Ready-to-submit token info
| Field | Value |
|---|---|
| Name | WalletLens |
| Symbol | LENZ |
| Decimals | 6 |
| Chain | Sui |
| Token standard | Sui Coin (`coin`) |
| Contract / coin type | `<PACKAGE_ID>::lenz::LENZ`  (filled after mainnet publish) |
| Package ID | `<PACKAGE_ID>` (after mainnet) |
| Total supply | 10,000,000 (fixed, mint frozen) |
| Category | Utility / DeFi / Consumer app token |
| Launch type | Fair launch — no presale, no sale, no insider allocation |

### Description (short — for DexScreener/CMC)
> $LENZ is the native token of walletlens.live — a free, privacy-first, all-asset
> net-worth tracker. Use the app and share it to earn $LENZ; hold for ad-free + pro
> features. Fixed 10M supply, mint frozen, no insider allocation.

### Description (long — for CoinGecko)
> WalletLens (walletlens.live) is a free, no-account, privacy-first portfolio &
> net-worth tracker for crypto, stocks, metals, fiat and cash — all data stays on the
> user's device. $LENZ is its native token on Sui: a fixed 10,000,000 supply with
> minting permanently frozen and no team/insider allocation. It is earned by using
> and sharing the app (use-to-earn), and holders unlock premium features (ad-free, pro
> analytics). The free core app always stays free.

### Official links (provide all on the forms)
- Website: https://walletlens.live
- Token page: https://walletlens.live/lenz
- Earn/airdrop: https://walletlens.live/airdrop
- X: https://x.com/wallet_lens
- Telegram: https://t.me/walletlenss
- YouTube: https://youtube.com/@walletlens
- GitHub (open source): https://github.com/tia8910/walletlens
- Docs/tokenomics: REWARDS.md + TOKENOMICS.md in the repo

## Assets to prepare
- **Logo:** export `sui-token/../client/public/lenz-coin.svg` to a **256×256 PNG**
  (transparent background) — CG/CMC require PNG. Keep the SVG for DexScreener.
- Banner / OG image (optional, for socials).

## CoinGecko / CoinMarketCap application checklist (free)
- [ ] Token live on Sui mainnet with a DEX pool + meaningful liquidity
- [ ] A few days of real trading volume
- [ ] Logo 256×256 PNG
- [ ] Contract/coin type + package id
- [ ] Total/circulating supply (and how circulating is computed)
- [ ] All official links above
- [ ] Apply: CoinGecko → "Request Form"; CoinMarketCap → "Add Cryptoasset"

## Circulating supply note (they always ask)
Circulating = total minus what's in the **time-locked reserve / unstarted seasons**
and locked LP. Publish the reserve/timelock address so circulating is verifiable.

## Don't forget
- Lock the LP and publish the proof (listings + community check this).
- Publish the mainnet **package id + coin type** on `/lenz` so listings link the
  right contract (and to fight fake/copycat tokens).
