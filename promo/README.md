# WalletLens Promotion Agent

Discovers Reddit posts where someone is asking for a **net-worth / portfolio /
investment-tracking tool** and drafts honest, helpful replies that mention
WalletLens as one option. **It never posts anything** — drafts are delivered to
you as a GitHub Issue to review and post manually. This keeps us compliant with
Reddit/X rules and avoids spam bans (auto-posting promo links gets accounts
shadowbanned and the domain blacklisted).

## How it runs

- Workflow: `.github/workflows/promote.yml`
- Schedule: **Mon & Thu, 10:00 UTC** (plus manual *Run workflow*)
- Each run: searches Reddit → Claude judges relevance + drafts replies → opens a
  GitHub Issue with the post links and ready-to-paste replies → remembers posts
  it has already surfaced (`promo/seen.json`) so you never see duplicates.

## Required setup

1. **`ANTHROPIC_API_KEY`** — repository secret (already used by the blog agent).
2. **Reddit OAuth credentials** *(required — Reddit blocks unauthenticated
   search from cloud/CI IPs)*:
   - Go to <https://www.reddit.com/prefs/apps> → **Create another app...**
   - Type: **script**. Name: anything. Redirect URI: `http://localhost`
   - Copy the **client ID** (under the app name) and the **secret**
   - Add repository secrets:
     - `REDDIT_CLIENT_ID`
     - `REDDIT_CLIENT_SECRET`

If Reddit creds are missing, the run fails fast with a message telling you to add
them (the Annotations panel shows the exact instructions).

## X / Twitter

X's API requires a paid tier (~$200/mo) for search, so the agent doesn't query
it. Instead each review issue includes ready-to-click **X live-search links** —
scan them, and paste any tweet to the team to get a drafted reply.

## Tuning

- Search queries / target keywords: `QUERIES` and `KEYWORDS` in `find-and-draft.mjs`
- Frequency: the `cron` in `promote.yml`
- Volume per run: `MAX_CANDIDATES`
