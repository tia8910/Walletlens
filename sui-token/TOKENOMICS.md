# $LENZ Tokenomics (Sui)

> **$LENZ is the native token of [walletlens.live](https://walletlens.live)** — a
> free, no-account, privacy-first all-asset portfolio tracker. Parameters below are
> encoded in `sources/lenz.move`; keep this file in sync.

## Design principles (no gaps)
- **Low, hard-capped supply** — 10,000,000 LENZ, minted once at publish.
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
| Max / total supply | **10,000,000 LENZ** |
| In base units | 10,000,000,000,000 |
| Circulating at genesis | **100%** (no vesting) |
| Mintable after publish | **No** — TreasuryCap frozen |
| Total supply visibility | Public (verifiable via `suix_getTotalSupply`) |

## Distribution (100% liquid at genesis — no unlocks)
| Allocation | % | LENZ | Base units |
|---|---:|---:|---:|
| Airdrop & rewards (community) | 50% | 5,000,000 | 5,000,000,000,000 |
| Liquidity (LP locked) | 35% | 3,500,000 | 3,500,000,000,000 |
| Ecosystem / DAO treasury | 15% | 1,500,000 | 1,500,000,000,000 |
| **Founder / team** | **0%** | **0** | — |
| **Total** | **100%** | **10,000,000** | **10,000,000,000,000** |

**No founder/insider allocation.** The deployer custodies the treasury and liquidity
reserves transparently, but holds no personal bag — the strongest "no insider"
guarantee. No vesting is needed because there is nothing to vest.

### Airdrop & rewards — internal split (users-heavy)
The 50% pool is distributed to the community, never to a single wallet:

| Sub-allocation | % of total | LENZ | Mechanism |
|---|---:|---:|---|
| Early users (snapshot) | 30% | 3,000,000 | one-time **Merkle claim** |
| Quests & referrals | 12.5% | 1,250,000 | phased campaigns |
| Ongoing usage rewards | 7.5% | 750,000 | drip over time |

**Anti-concentration / anti-sybil rules:**
- **Flat allocation** — the pool is split equally among eligible wallets, so making
  many wallets earns ~no extra (farming is uneconomic).
- **Per-wallet cap** — hard cap enforced in tooling (≈0.1% of supply = 10,000 LENZ;
  configurable) so no single address is over-allocated.
- **On-chain gating** — only wallets with real prior Sui activity qualify; fresh,
  zero-history throwaway wallets are filtered out (`scripts/prepare-snapshot.mjs`).
- **Claim-based (Merkle) distribution** — publish one snapshot + proof root; users
  claim their own allocation (paying their own gas). No mass manual sends, far cheaper.
- **Phased release** — snapshot batch first; quests and ongoing rewards later.

## Utility (proposed)
- **Governance** over roadmap, supported assets, and treasury spend.
- **Usage rewards** for contributions (translations, content, referrals).
- **Hold-to-unlock cosmetics** that never gate the free core app.

$LENZ never custodies user funds and the free core app never requires it.
