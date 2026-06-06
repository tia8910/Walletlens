# $LENZ Launch Runbook

A concrete, ordered checklist for launching $LENZ — the native token of
[walletlens.live](https://walletlens.live) — safely and credibly. Do the phases in
order; do not skip testnet or the audit if real value will ride on this.

> Legend: 🟢 do yourself · 🟡 needs a third party (auditor/lawyer) · 🔴 irreversible

---

## Phase 0 — Decide & document (before any code runs)

- 🟢 Confirm final parameters: **21,000,000 hard cap, 6 decimals, no unlocks**,
  distribution (Community 50% / Liquidity 35% / Treasury 15%). Edit
  `config/instantiate.*.json` if changing.
- 🟢 Decide custody of each allocation wallet. Treasury should be a **multisig**
  (e.g. a Secret multisig / governance), not a personal hot wallet.
- 🟡 **Legal check.** How you distribute (especially any sale) can make $LENZ a
  regulated security in your jurisdiction. A no-sale, no-insider, airdrop-based
  launch lowers risk but does not eliminate it. Talk to a lawyer *before* marketing.

## Phase 1 — Build (reproducible, audited base)

- 🟢 `./scripts/bootstrap.sh` — clones the audited `snip20-reference-impl` at the
  pinned tag and compiles the optimized wasm.
- 🟢 Record the printed **code hash (uncompressed wasm)** — you will publish it.

## Phase 2 — Testnet dry run (`pulsar-3`)

- 🟢 Fund a testnet key from the faucet; `INIT_CONFIG=config/instantiate.testnet.json`.
- 🟢 `./scripts/upload.sh` → `./scripts/instantiate.sh`.
- 🟢 Exercise the full flow: `create-viewing-key.sh`, `query-balance.sh`, a transfer
  between two test wallets, and confirm balances stay private.
- 🟢 `./scripts/verify-onchain.sh` — confirm a clean PASS report on testnet.

## Phase 3 — Audit & review (if real value)

- 🟡 Commission an **independent audit** of your config, any modifications, and the
  multisig/treasury setup. (The reference impl itself is already audited.)
- 🟢 Freeze parameters after the audit. Any change = re-audit.

## Phase 4 — Mainnet launch (`secret-4`) 🔴

- 🟢 Generate a fresh `prng_seed`: `head -c 32 /dev/urandom | base64`.
- 🟢 Fill **all** `REPLACE_WITH_*` addresses in `config/instantiate.mainnet.json`
  (the instantiate script refuses to run with placeholders left in).
- 🔴 `./scripts/upload.sh` then `./scripts/instantiate.sh` on `secret-4`.
- 🔴 **Close the admin rug vector immediately:** `./scripts/renounce-admin.sh <multisig>`
  (or `--renounce`). Minting is already disabled, so the cap is now final.

## Phase 5 — Liquidity

- 🟢 Create a $LENZ pool on a Secret-native DEX (e.g. **Shade Protocol** /
  **SecretSwap**) and seed it from the Liquidity allocation.
- 🔴 **Lock the LP** (or send LP to a timelock/burn) so liquidity cannot be pulled —
  the single biggest trust signal after renouncing admin.

## Phase 6 — Publish proof & go live on the site

- 🟢 Publish, on `/lenz` and in `SECURITY.md`: **contract address**, **code hash**,
  **distribution wallet addresses**, **LP-lock proof link**, **admin status**.
- 🟢 Run `./scripts/verify-onchain.sh` and paste the PASS report publicly.
- 🟢 Enable the gated entry in `client/src/data/trackCoins.js` *only after* a real
  price exists (DEX liquidity is live). Ask Claude to wire the address + hash into
  the page and add an explorer-linked "Official contract" box.

## Phase 7 — Distribution & community

- 🟢 Run the airdrop to WalletLens users / contributors from the Community wallet.
- 🟢 Stand up channels (X, Discord/Telegram) and pin: official contract address +
  the anti-phishing notice. Scammers deploy fake "$LENZ" and claim sites within
  minutes of any launch — pinning the canonical address is essential.
- 🟢 Open governance (treasury is a multisig/DAO; publish the policy).

---

## Anti-scam launch hygiene (non-negotiable)

- One canonical contract address, published everywhere you control.
- Never DM holders; never run a "connect wallet to claim" site; never ask for seed
  phrases or viewing keys. Say so loudly and often.
- Report impersonator tokens/sites; warn your community proactively.

## Realistic expectations

- Privacy tokens are **delisted by many CEXes** — plan for DEX-first liquidity.
- A token needs **real, sustained utility** (governance, rewards, private tipping)
  to matter beyond launch day. Ship the utility, not just the token.
