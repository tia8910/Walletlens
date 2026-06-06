# X (Twitter) Post Agent — setup

An AI agent (`promo/post-x-agent.mjs`, run daily by `.github/workflows/post-x.yml`)
that writes one on-brand $LENZ/WalletLens post per day with Claude.

## Two modes
- **Draft mode (default, no setup):** with only `ANTHROPIC_API_KEY`, it opens a
  GitHub **Issue** containing the day's draft — you copy-paste it to X. Zero risk.
- **Auto-post mode:** add the four `X_API_*` secrets and it posts directly to
  **@wallet_lens**.

## What it will NOT do (on purpose)
It only publishes **original posts**. It does **not** auto-reply, auto-follow, or
auto-like — X bans that as platform manipulation, and audiences disengage from
obvious bots. **Replies and engagement stay human** — that's where trust is built.

## Enable auto-posting (X API, free tier is enough for 1/day)
1. Go to the **X Developer Portal** → create a Project + App.
2. In the app's **User authentication settings**: enable **OAuth 1.0a**, set app
   permissions to **Read and write**.
3. Generate **API Key & Secret** (consumer keys) and an **Access Token & Secret**
   for the @wallet_lens account (must be created *after* setting read+write).
4. Add these as **GitHub repo secrets** (Settings → Secrets → Actions):
   - `X_API_KEY`, `X_API_SECRET` (the consumer key/secret)
   - `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (the access token/secret)
   - `ANTHROPIC_API_KEY` (already used by your other promo workflows)
5. Done. The daily workflow auto-posts; trigger a test run via
   **Actions → WalletLens X Post Agent → Run workflow**.

## Tuning
- **Frequency:** edit the cron in `post-x.yml` (default daily 14:00 UTC). 1–2/day is
  plenty; more looks spammy and burns the free-tier write limit (~500/month).
- **Themes:** edit the `THEMES` array in `post-x-agent.mjs` (rotates daily).
- The agent is grounded in fixed product facts and is told **never** to make
  price/returns claims.

## Honest expectation
This keeps the account **alive** (consistent posting) so it never looks dead — but
growth still needs a human replying and engaging in the Sui/crypto community. The
agent removes the "I forgot to post" problem, not the "show up and be human" part.
