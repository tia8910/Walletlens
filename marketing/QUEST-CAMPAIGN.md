# $LENZ Quest Campaign Kit (Galxe / Zealy)

Ready-to-paste content to launch a **pre-launch points campaign**. No quest platform
has an API to create campaigns, so you paste this into the dashboard (≈10 min). It
collects participants now; **points convert to $LENZ at mainnet launch** via the
Merkle claim (see `sui-token/AIRDROP.md`).

> ⚠️ Framing: the token is on **testnet**. The campaign awards **points / OATs**, not
> live tokens. Never imply "claim live $LENZ now." Wording below is safe.

---

## Platform pick
- **Galxe** — best discovery + sybil tools. Recommended. Create a **Space**, verify
  with @wallet_lens, add the quests below.
- **Zealy** — good if you run a Discord/community board.

## Campaign meta (paste into the dashboard)
- **Title:** `$LENZ Genesis — Use & Earn (pre-launch)`
- **Subtitle:** `Earn early-supporter points toward the $LENZ airdrop on Sui.`
- **Description:**
  > $LENZ is the native token of walletlens.live — a free, privacy-first, all-asset
  > net-worth tracker. Use the app and join the community to earn early-supporter
  > points. Points convert to $LENZ at launch on Sui. Fixed 10M supply, mint frozen,
  > 0% insiders, no sale. Free to enter — no purchase, and no wallet connection needed
  > to join the waitlist. Not financial advice.
- **Reward type:** Points / OAT (no live token).
- **Duration:** a focused **2–4 week** window (set start + end dates).

## Quests (with points + how each is verified)
| # | Quest | Points | Verify on the platform |
|---|---|---:|---|
| 1 | **Join the $LENZ waitlist** (walletlens.live/airdrop) ⭐ | 100 | "Visit page" / custom API → `GET https://walletlens.tia8910.deno.net/status?address={wallet}` returns `registered` |
| 2 | **Connect your Sui wallet** (for your allocation) ⭐ | required | platform's Sui wallet connect |
| 3 | Follow **@wallet_lens** on X | 50 | Galxe/Zealy X-follow credential |
| 4 | Follow **@Walletlenslive** on X | 50 | X-follow credential |
| 5 | **Repost** the pinned launch post | 75 | X-repost credential |
| 6 | **Use WalletLens** — open the app & add a holding | 100 | "Visit walletlens.live" (soft) |
| 7 | **Write a thread** about $LENZ (quality, reviewed) ⭐ | 500 | submit-link → manual review |
| 8 | Quote/Mention **@wallet_lens** | 25 | X-credential |
| 9 | Refer a friend (who also joins) | 50 | platform referral |

⭐ = the ones that matter most: **waitlist + Sui wallet** (so you can pay them) and the
**thread** (best organic reach).

## Eligibility & anti-sybil (state this on the campaign page)
- Connect a **Sui wallet** — that's where $LENZ is claimed at launch.
- **Flat, capped allocation** (~0.1%/wallet) — farming many wallets earns ~nothing.
- **On-chain gate at snapshot** — wallets with no real Sui history are filtered out.
- Enable the platform's **sybil / anti-bot** options.
- **Points → $LENZ at launch**, pro-rata, claimed on-chain (claim-once). Participation
  does not guarantee an allocation.

## At launch — convert participants to the airdrop
1. **Export** the eligible participant list from Galxe/Zealy (CSV with their Sui addresses).
2. `node sui-token/scripts/galxe-to-candidates.mjs export.csv candidates.csv`  (extracts Sui addresses)
3. `node sui-token/scripts/prepare-snapshot.mjs candidates.csv --pool <LENZ> --min-tx 1`  (gate + flat cap)
4. `node sui-token/scripts/build-merkle.mjs snapshot.csv`  (root + proofs)
5. `airdrop::create` on Sui → users claim. (See `sui-token/AIRDROP.md`.)

You can also merge in the **waitlist** list from `GET /export` (admin) before step 3.

## Promotion
Announce from **@Walletlenslive** (your bigger, established account) → drive to the
Galxe page + walletlens.live/airdrop. Use the daily `lenz-social-agent` cards.
Submit the campaign to Galxe "Explore" and free quest-aggregators.

## Honest note
A quest campaign attracts mercenary/sybil users; the flat-capped + on-chain-gated
design makes that uneconomic, and the genuine product (a real, useful app) is what
converts some of them into actual users. Time-box the campaign toward a launch date.
