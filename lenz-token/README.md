# $LENZ — WalletLens Privacy Token (SNIP-20 on Secret Network)

**$LENZ is a genuinely private token** built on [Secret Network](https://scrt.network).
Unlike an ERC-20 (where every balance and transfer is public on a block explorer),
SNIP-20 tokens keep **balances and transfer amounts encrypted on-chain**. Holders
read their own balance through a *viewing key* or a *permit*; outsiders cannot.

This makes $LENZ a real fit for WalletLens's privacy-first identity — not a public
token with "privacy" in the name.

---

## ⚠️ Read this before you deploy anything

This project does **not** hand-roll cryptography. It builds on the **audited
reference implementation** maintained by SCRT Labs:
<https://github.com/scrt-labs/snip20-reference-impl>. The `scripts/bootstrap.sh`
step clones that repo at a **pinned tag** and compiles it; we only supply the
**$LENZ configuration** and the **deploy tooling**.

Even so:

- **Get an independent audit before mainnet** if real value will be attached. The
  reference impl is audited, but *your configuration, your admin-key handling, and
  any modifications are not.*
- **Test on `pulsar-3` (testnet) first.** Every script below defaults to testnet.
- **Understand the regulatory reality.** Privacy tokens are delisted by many
  exchanges and may be treated as securities depending on how they're marketed and
  distributed. This repo is engineering scaffolding, not legal advice.

---

## What's in here

```
lenz-token/
  config/
    instantiate.testnet.json   # $LENZ init params for pulsar-3 (privacy defaults)
    instantiate.mainnet.json   # $LENZ init params for secret-4
  scripts/
    bootstrap.sh               # clone + compile the audited SNIP-20 ref impl (pinned)
    upload.sh                  # store the optimized wasm on-chain → returns code id
    instantiate.sh             # instantiate $LENZ from a code id + config
    create-viewing-key.sh      # mint a viewing key so you can read your balance
    query-balance.sh           # query your (private) balance with a viewing key
    env.example.sh             # copy to env.sh and fill in
  TOKENOMICS.md                # supply, distribution, utility, vesting
  Makefile                     # convenience wrappers around the scripts
```

The compiled contract artifact and the cloned reference repo are git-ignored — they
are reproducible from the pinned tag.

---

## Prerequisites

- **Rust** + `wasm32-unknown-unknown` target, and **Docker** (for the optimizer).
  See <https://docs.scrt.network/secret-network-documentation/development/getting-started>.
- **`secretcli`** ≥ 1.13 — the Secret Network CLI.
  Install: <https://docs.scrt.network/secret-network-documentation/infrastructure/secret-cli/install-secret-cli>
- A funded key. Get testnet SCRT from the faucet: <https://faucet.pulsar.scrttestnet.com>

---

## Quick start (testnet)

```bash
cd lenz-token
cp scripts/env.example.sh scripts/env.sh    # then edit scripts/env.sh
chmod +x scripts/*.sh

# 1. Add / import the wallet secretcli will deploy with
secretcli keys add deployer            # or: secretcli keys import ...

# 2. Build the audited SNIP-20 reference impl (pinned tag) → artifact/contract.wasm.gz
./scripts/bootstrap.sh

# 3. Upload the wasm → prints the CODE_ID
./scripts/upload.sh

# 4. Instantiate $LENZ (edit CODE_ID in scripts/env.sh first)
./scripts/instantiate.sh

# 5. Create a viewing key and read your private balance
./scripts/create-viewing-key.sh
./scripts/query-balance.sh
```

Or via make: `make bootstrap && make upload && make instantiate`.

---

## Why SNIP-20 and not ERC-20

| | $LENZ (SNIP-20) | A "privacy" ERC-20 |
|---|---|---|
| Balances | Encrypted on-chain | Public on every explorer |
| Transfer amounts | Hidden | Public |
| How you read your balance | Viewing key / signed permit | Anyone can read it |
| Honest to call a "privacy coin" | Yes | No |

If you ever want EVM reach too, the honest pattern is: ship $LENZ as SNIP-20 here,
and bridge a *clearly-labelled, non-private* wrapper to EVM separately — never imply
the EVM side is private.

---

## Listing $LENZ inside the WalletLens app

Once $LENZ is live and has a price source, it can be added to WalletLens's
`client/src/data/trackCoins.js` (`TRACK_COINS`) as a `crypto` asset so users can
track it. That is a **separate** change from minting the token and should only land
after a real, queryable market price exists — otherwise the tracker has nothing to
chart. See `TOKENOMICS.md` for the launch sequencing.
