# ⚠️ Legacy server — NOT deployed, do not deploy

This Express + SQLite server is a leftover from an early architecture. The
production client (walletlens.live) does **not** call it anywhere — all data
is client-side (localStorage) and serverless features run on Deno Deploy
(`voice-api/`, `airdrop-api/`, `push-api/`).

Known issues if it were ever deployed as-is:

- **No authentication**: every route exposes unrestricted read/write of all
  wallets and transactions.
- **Plaintext secrets**: `routes/exchanges.js` stores exchange API keys and
  secrets unencrypted in SQLite and returns them via `GET /:id`.

Keep it only as a reference, or delete it. If it is ever revived it needs
auth, per-user scoping, and encrypted credential storage first.
