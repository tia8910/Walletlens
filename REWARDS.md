# $LENZ Rewards Spec — "Use & Earn"

How users earn $LENZ by using WalletLens and growing the community. This is the
official action menu, point values, recording rails, and the points→$LENZ rule.

> **Status: COMING SOON.** Earning is not live yet (still pre-launch / testnet).
> Users can **join the waitlist** now (paste a Sui address — no wallet connection).
> Every earn feature ships labelled "Coming soon" until mainnet launch.

## Phases
- **Phase 1 — Bootstrap (now → launch):** earn **Points** for in-app usage + sharing.
  No on-chain holding rewards yet (no distribution exists). Builds the community that
  becomes the first distribution.
- **At launch:** Points → **$LENZ** (first distribution via the Merkle claim).
- **Phase 2 — Post-launch:** add on-chain rewards (hold/lock/LP) + holder perks
  (ad-free, pro features) via lock-to-access tiers.

## Earn actions (Phase 1)

### In-app usability
| Action | Points | Recorded |
|---|---:|---|
| Daily streak (use the app) ⭐ | 10/day + streak bonus | one check-in flag/day |
| Create your portfolio (1st holding) | 100 | flag (not holdings) |
| Track 3+ assets | 100 | count flag |
| Complete an Academy lesson | 50 each | flag per lesson |
| Finish the Academy | 200 bonus | flag |
| Use a feature (AI / alert / import) | 50 each | flag per feature |
| Install the PWA | 50 | flag |

### Sharing & content
| Action | Points | Recorded |
|---|---:|---|
| Refer a friend who becomes active ⭐ | 200 / active referral | referral link + referee activity |
| Write a thread about WalletLens/$LENZ ⭐ | 500 (reviewed) | submit URL → manual/community review |
| Mention @wallet_lens in a post | 25 (1/day cap) | Galxe verifies |
| Share an article (blog) | 30 + active-user bonus | tracked `?ref=` link |
| Share your portfolio card/screenshot | 50 | flag / Galxe |
| Follow + repost @wallet_lens | 50 (one-time) | Galxe |

⭐ headline actions: **daily streak** (retention) and **active referral** + **thread**
(growth). Most weight on real usage and high-quality content; social mentions low.

## Recording rails (privacy intact)
1. **On-chain** (Phase 2 only): read from Sui at season end — nothing stored.
2. **Minimal ledger** (`airdrop-api`): stores only `address → points/flags`. **Never
   holdings, never identity.** App sends action *flags*, not portfolio contents.
3. **Galxe**: verifies social actions; you import the list.

## Points → $LENZ (at launch)
- Points are converted to $LENZ from the **first-distribution budget** (a fixed slice
  of the community pool), **pro-rata** to points, with a **per-wallet cap**.
- An **on-chain wallet gate** is applied at conversion (fresh farm wallets filtered).
- Distribution via the audited Merkle claim (claim-once enforced on-chain).

## Anti-farm
- Caps per action; referral pays only for **active** referees; threads are
  **review-gated**; mentions capped/day.
- Fixed budget split pro-rata → faking just dilutes everyone.
- On-chain gate at conversion.

## Privacy statement (keep exact)
> "Your portfolio never leaves your device. The optional $LENZ rewards program records
> only your Sui address and the points you earn — never your holdings, never your
> identity — and only if you choose to participate."

## Build status
- Waitlist (paste address) — **live now**.
- All earn actions — **Coming soon** (UI shows the badge until launch).
- Points engine (`airdrop-api`) — built, dormant until launch.
