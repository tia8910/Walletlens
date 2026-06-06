# $LENZ Tokenomics

> Draft parameters. Numbers below are encoded in `config/instantiate.*.json`. Change
> them there and keep this file in sync. Nothing here is final until you decide it is.

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
| Total supply | 100,000,000 LENZ |
| In base units | 100,000,000,000,000 uLENZ |
| `public_total_supply` | **false** — total supply is hidden, consistent with a privacy token |
| Mintable after launch | **false** — fixed supply (no inflation, no admin minting) |
| Burnable | **false** by default (enable only if you want deflation) |

A fixed, non-mintable supply is the most credible default: it removes the "admin can
print more" trust problem. If you instead want a treasury that can mint, flip
`enable_mint` to `true` in the config — but document the policy publicly.

## Distribution (suggested)

The reference impl seeds balances at instantiation via `initial_balances`. Suggested
split (adjust in the config before deploying):

| Allocation | % | LENZ | Notes |
|---|---:|---:|---|
| Community / rewards | 40% | 40,000,000 | airdrops to WalletLens users, usage rewards |
| Ecosystem / liquidity | 25% | 25,000,000 | DEX liquidity (e.g. Shade/SecretSwap), CEX listings |
| Team | 15% | 15,000,000 | **vest** — see below |
| Treasury / DAO | 15% | 15,000,000 | governance-controlled |
| Public sale / IDO | 5% |  5,000,000 | optional |

> **Vesting note:** SNIP-20 itself has no vesting. Don't put team/treasury tokens in a
> normal wallet and "promise" to vest. Send them to a **vesting/timelock contract** or
> a multisig with a published schedule. Putting all 100M in one admin wallet at launch
> is the single most common red flag — avoid it.

## Utility (proposed)

$LENZ should have real, non-speculative utility or it's just a token. Options that fit
WalletLens:

- **Premium-but-still-free-tier:** unlock cosmetic / power-user features by *holding*
  (not spending) LENZ, keeping the "free forever" promise intact.
- **Governance:** vote on roadmap, supported assets, and treasury spend.
- **Usage rewards:** earn LENZ for contributing (translations, blog, referrals).
- **Private tipping:** users tip creators/contributors privately, leveraging the
  SNIP-20 privacy — a genuine reason to use a *private* token vs a public one.

Pick utility that does **not** require WalletLens to custody user funds or hold the
admin key over user balances — that would contradict the product's privacy pitch.

## Launch sequencing

1. Finalize supply, distribution, vesting → update `config/instantiate.*.json`.
2. Deploy to **pulsar-3** testnet, exercise transfers / viewing keys end to end.
3. (If real value) **independent audit** of config + any modifications + vesting setup.
4. Deploy to **secret-4** mainnet; move team/treasury to vesting/multisig immediately.
5. Seed DEX liquidity so a **real price** exists.
6. Only then: add $LENZ to `client/src/data/trackCoins.js` so WalletLens can track it.

## Regulatory reality (not legal advice)

- Privacy tokens are **delisted by several major exchanges** — liquidity will likely
  live on DEXes / Secret-native venues.
- How you sell/distribute (especially a public sale) can make $LENZ a **security** in
  some jurisdictions. Talk to a lawyer before any sale or marketing that promises
  returns.
