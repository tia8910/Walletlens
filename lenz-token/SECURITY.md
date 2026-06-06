# $LENZ — Security & Legitimacy ("don't trust, verify")

$LENZ is a real, long-term token for [walletlens.live](https://walletlens.live) — not
a pump-and-dump. This document lists every property that protects holders **and the
exact command to verify each one on-chain yourself.** Nothing here asks you to take
our word for it.

> **Anti-phishing — read first.** The only official $LENZ contract address and code
> hash are the ones published on **https://walletlens.live/lenz** and in this repo.
> WalletLens will **never** DM you, never run a "claim/airdrop" site that asks you to
> connect a wallet or sign a transaction, and never asks for your seed phrase or
> viewing key. Any site or message that does is a scam.

---

## The guarantees (and how to verify them)

Set `ADDR` to the published contract address and `NODE` to a Secret LCD endpoint,
then run the checks. `./scripts/verify-onchain.sh` runs all of them at once and prints
a PASS/FAIL report.

### 1. The deployed bytecode is the audited reference implementation
$LENZ runs the **audited `scrt-labs/snip20-reference-impl`**, built reproducibly. The
on-chain code hash must equal the hash of that audited build — proving no hidden,
malicious logic was deployed.

```bash
# On-chain code hash:
secretcli q compute contract-hash-by-contract-address "$ADDR" --node "$NODE"
# Local hash of the audited build (after ./scripts/bootstrap.sh):
gunzip -c artifact/contract.wasm.gz | sha256sum
# These two MUST match (ignoring the 0x prefix).
```

### 2. Fixed supply — minting is permanently disabled
No one can ever print new $LENZ. `enable_mint` was `false` at instantiation and SNIP-20
provides no way to re-enable it.

```bash
secretcli q compute query "$ADDR" '{"minters":{}}' --node "$NODE"   # → empty list
secretcli q compute query "$ADDR" '{"token_info":{}}' --node "$NODE" # → total_supply = 21,000,000 LENZ
```

### 3. No unlocks, no vesting, no insider bag
100% of supply is liquid at genesis. There is **no team/insider allocation** and **no
locked tranche** that can unlock later. Distribution wallets are published; verify the
genesis balances match the published distribution.

### 4. No admin rug vector — admin renounced or held by a multisig
After launch the contract admin is either **renounced** (set to a no-op/burn address)
or held by a **published multisig** — never a single hot wallet. With mint disabled,
the admin cannot inflate supply regardless.

```bash
secretcli q compute contract-info "$ADDR" --node "$NODE"   # inspect the "admin" field
```

### 5. Liquidity is locked
The DEX LP position is locked so liquidity cannot be pulled. The lock contract/lock
proof is published alongside the contract address.

### 6. Not upgradeable
SNIP-20 has no proxy/upgrade mechanism. The code at `$ADDR` cannot be swapped out from
under holders.

---

## Reproducible build

`scripts/bootstrap.sh` pins the reference implementation by tag (and optionally by
commit via `REF_COMMIT`) and compiles with the deterministic Secret optimizer, so the
artifact — and therefore the on-chain code hash — is reproducible by anyone. Publish
the resulting code hash so third parties can confirm they built the same bytecode.

## Before mainnet (operator checklist)

- [ ] Generate `prng_seed` from a CSPRNG: `head -c 32 /dev/urandom | base64`.
- [ ] Fill all `REPLACE_WITH_*` addresses; **no placeholders** (instantiate guards this).
- [ ] Deploy & exercise on **pulsar-3** testnet first.
- [ ] **Independent third-party audit** of the config + any modifications.
- [ ] Deploy to **secret-4**; immediately **renounce admin or hand to a multisig**.
- [ ] Seed DEX liquidity and **lock the LP**.
- [ ] Publish: contract address, code hash, distribution wallets, LP-lock proof — on
      `/lenz` and in this repo.
- [ ] Run `./scripts/verify-onchain.sh` and paste the PASS report publicly.

## Reporting a vulnerability

Email **contact@walletlens.live** (see `/.well-known/security.txt`). We aim to
acknowledge within 72 hours. Please do not open public issues for sensitive reports.
