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
- Each run: Claude searches Reddit using built-in web search → drafts helpful
  replies for relevant posts → opens a GitHub Issue with ready-to-paste replies
  → remembers posts it has already surfaced (`promo/seen.json`) so you never
  see duplicates.

## Required setup

**`ANTHROPIC_API_KEY`** — repository secret (already used by the blog agent).
That's it. No Reddit credentials needed — Claude's built-in web search handles
Reddit discovery without any API keys.

## X / Twitter

X's API requires a paid tier (~$200/mo) for search, so the agent doesn't query
it. Instead each review issue includes ready-to-click **X live-search links** —
scan them, and paste any tweet to the team to get a drafted reply.

## Tuning

- Search queries: the `prompt` in `find-and-draft.mjs` (the `site:reddit.com` queries)
- Frequency: the `cron` in `promote.yml`
