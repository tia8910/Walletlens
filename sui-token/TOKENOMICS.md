# $LENZ Tokenomics (Sui)

> **$LENZ is the native token of [walletlens.live](https://walletlens.live)** — a
> free, no-account, privacy-first all-asset portfolio tracker. Parameters below are
> encoded in `sources/lenz.move`; keep this file in sync.

## Design principles (no gaps)
- **Low, hard-capped supply** — 21,000,000 LENZ, minted once at publish.
- **Minting locked forever** — the TreasuryCap is frozen at publish, so `coin::mint`
  can never run again. No inflation, ever.
- **No unlocks, no vesting, no insider allocation** — 100% liquid at genesis.
- **Immutable metadata** — name/symbol/decimals/icon frozen.
- **Verifiable** — total supply, frozen cap and frozen metadata are all readable
  on-chain (`scripts/verify-onchain.sh`).

> Sui is a public chain (balances/transfers are visible). $LENZ is the native /
> utility token of a privacy-first app — not a "privacy coin." The privacy is in the
> product (data stays on your device), not in the token's transfers.

## Identity
| Field | Value |
|---|---|
| Name | WalletLens |
| Symbol | LENZ |
| Decimals | 6 |
| Chain | Sui |
| Type | `coin` (one-time-witness), supply locked by freezing the TreasuryCap |
| Base unit | 1 LENZ = 1,000,000 base units |

## Supply
| | |
|---|---|
| Max / total supply | **21,000,000 LENZ** |
| In base units | 21,000,000,000,000 |
| Circulating at genesis | **100%** (no vesting) |
| Mintable after publish | **No** — TreasuryCap frozen |
| Total supply visibility | Public (verifiable via `suix_getTotalSupply`) |

## Distribution (100% liquid at genesis — no unlocks)
| Allocation | % | LENZ | Base units |
|---|---:|---:|---:|
| Community airdrop & rewards | 50% | 10,500,000 | 10,500,000,000,000 |
| Liquidity (LP locked) | 35% | 7,350,000 | 7,350,000,000,000 |
| Ecosystem / DAO treasury | 15% | 3,150,000 | 3,150,000,000,000 |
| **Total** | **100%** | **21,000,000** | **21,000,000,000,000** |

There is no team/insider allocation to vest — a stronger guarantee than any schedule.

## Utility (proposed)
- **Governance** over roadmap, supported assets, and treasury spend.
- **Usage rewards** for contributions (translations, content, referrals).
- **Hold-to-unlock cosmetics** that never gate the free core app.

$LENZ never custodies user funds and the free core app never requires it.
