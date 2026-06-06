# $LENZ Tokenomics

> **$LENZ is the native token of [walletlens.live](https://walletlens.live)** — a
> 100% free, no-account, privacy-first all-asset portfolio tracker for crypto,
> stocks, precious metals, fiat and real estate, with AI insights and live prices,
> where all your data stays on your device.
>
> Parameters below are encoded in `config/instantiate.*.json`. Change them there and
> keep this file in sync.

## Design principles (no gaps)

- **Low, hard-capped supply** — 21,000,000 LENZ, minting permanently disabled.
- **No unlocks, no vesting, no cliffs** — 100% of supply is minted and liquid at
  genesis. There is no locked tranche that can drip onto the market later, so there
  is no "unlock cliff" overhang and no hidden future dilution.
- **No team/insider allocation, no private sale** — nothing reserved for insiders.
- **Publicly verifiable cap** — `public_total_supply = true`, so anyone can confirm
  the 21M hard cap on-chain. **Individual balances and transfer amounts stay
  private** (that's the SNIP-20 privacy guarantee); only the *total* is public.

## Identity

| Field | Value |
|---|---|
| Name | WalletLens |
| Symbol | LENZ |
| Decimals | 6 |
| Chain | Secret Network (`secret-4` mainnet / `pulsar-3` testnet) |
| Standard | SNIP-20 (private balances & transfers) |
| Base unit | 1 LENZ = 1,000,000 uLENZ (micro-LENZ) |

## Supply

| | |
|---|---|
| Max / total supply | **21,000,000 LENZ** |
| In base units | 21,000,000,000,000 uLENZ |
| Circulating at genesis | **100%** (fully liquid, no vesting) |
| `enable_mint` | **false** — fixed cap, no inflation, ever |
| `enable_burn` | **false** by default |
| `public_total_supply` | **true** — the hard cap is publicly verifiable |

## Distribution (100% liquid at genesis — no unlocks)

| Allocation | % | LENZ | Notes |
|---|---:|---:|---|
| Community airdrop & rewards | 50% | 10,500,000 | airdrops to WalletLens users, usage/contribution rewards |
| Liquidity | 35% |  7,350,000 | DEX liquidity (e.g. Shade / SecretSwap) so a real price exists |
| Ecosystem / DAO treasury | 15% |  3,150,000 | governance-controlled, fully liquid (no team lock) |
| **Total** | **100%** | **21,000,000** | |

> **Why no vesting?** Vesting exists to reassure holders that insiders won't dump
> locked tokens. With **no team/insider allocation at all**, there is nothing to
> vest — which is a stronger guarantee than any schedule. The treasury is a
> transparent, governance-controlled wallet, not a private insider bag.
>
> **Liquidity note:** "no token unlocks" refers to vesting/cliffs. Locking the
> *LP position* (so liquidity can't be pulled) is a separate good practice and is
> recommended — it protects holders without reintroducing a token unlock schedule.

## Utility (proposed)

$LENZ should have real, non-speculative utility tied to walletlens.live:

- **Governance** — vote on the roadmap, supported assets, and treasury spend.
- **Usage rewards** — earn LENZ for contributing (translations, content, referrals).
- **Private tipping** — tip contributors privately, leveraging SNIP-20 privacy — a
  genuine reason to use a *private* token rather than a public one.
- **Hold-to-unlock cosmetics** — optional flourishes that **never** gate the free
  core app. WalletLens stays 100% free; $LENZ never custodies user funds.

## Launch sequencing

1. Confirm cap + distribution → already encoded in `config/instantiate.*.json`.
2. Deploy to **pulsar-3** testnet; exercise transfers / viewing keys end to end.
3. (If real value) **independent audit** of the config and any modifications.
4. Deploy to **secret-4** mainnet. Mint is disabled, so the 21M cap is final.
5. Seed DEX liquidity (and lock the LP) so a **real price** exists.
6. Only then: enable the gated $LENZ entry in `client/src/data/trackCoins.js` so
   WalletLens can track it.

## Regulatory reality (not legal advice)

- Privacy tokens are **delisted by several major exchanges** — liquidity will likely
  live on DEXes / Secret-native venues.
- How you distribute (especially any sale) can make $LENZ a **security** in some
  jurisdictions. The fair, no-insider, no-sale design reduces — but does not
  eliminate — that risk. Talk to a lawyer before any sale or returns-based marketing.
