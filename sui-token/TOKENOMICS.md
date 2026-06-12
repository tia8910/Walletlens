# $LENZ Tokenomics (Sui)

> **$LENZ is the native token of [walletlens.live](https://walletlens.live)** — a
> free, no-account, privacy-first all-asset portfolio tracker. Parameters below are
> encoded in `sources/lenz.move`; keep this file in sync.

## Design principles (no gaps)
- **Low, hard-capped supply** — 10,000,000 LENZ, minted once at publish.
- **Minting locked forever** — the TreasuryCap is frozen at publish, so `coin::mint`
  can never run again. No inflation, ever.
- **No insider allocation** — 0% to team/VCs. Reward & reserve tokens are released
  over time from a **transparent, time-locked schedule** (use-&-earn), not dumped at
  once — protecting holders from sudden sell pressure.
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
| Circulating | **Released over time** (use-&-earn); reserve time-locked |
| Mintable after publish | **No** — TreasuryCap frozen |
| Insider/team allocation | **0%** |
| Total supply visibility | Public (verifiable via `suix_getTotalSupply`) |

## Distribution (community-first — no insider bag)
| Allocation | % | LENZ | Base units |
|---|---:|---:|---:|
| Airdrop & rewards (community) | 50% | 5,000,000 | 5,000,000,000,000 |
| Liquidity (LP locked) | 35% | 3,500,000 | 3,500,000,000,000 |
| Ecosystem / DAO treasury | 15% | 1,500,000 | 1,500,000,000,000 |
| **Founder / team** | **0%** | **0** | — |
| **Total** | **100%** | **10,000,000** | **10,000,000,000,000** |

**No founder/insider allocation (0%).** Reward and reserve tokens are not dumped at
genesis — they're released over time from a **transparent, time-locked schedule**, so
no single party holds a dominant liquid bag and there's no unlock-cliff overhang.

### Community rewards — "use & earn" (released over time)
The 50% pool reaches the community by **using and sharing the app**, never a single
wallet. Users earn **points**; points convert to $LENZ each season (see `REWARDS.md`):

| Sub-allocation | % of total | LENZ | Mechanism |
|---|---:|---:|---|
| Early users / first season | 30% | 3,000,000 | points → **Merkle claim** |
| Quests & referrals | 12.5% | 1,250,000 | phased campaigns |
| Ongoing usage rewards | 7.5% | 750,000 | tapering seasons |

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

## Utility
- **Use & earn** — earn $LENZ by using WalletLens and sharing it; no purchase required.
- **Holder perks** — hold/lock $LENZ to unlock an ad-free app and pro features
  (rolling out after launch).
- **Governance** over roadmap, supported assets, and treasury spend.
- **Free core, always** — the free tracker never changes and never requires $LENZ.

$LENZ never custodies user funds and the free core app never requires it.
