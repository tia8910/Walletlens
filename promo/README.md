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

---

## YouTube Comment Agent

Searches YouTube for videos about portfolio and net-worth tracking, scans their
comment sections for questions or tool-recommendation requests, and drafts
helpful replies mentioning WalletLens for a human to review and post manually.
**Nothing is ever posted automatically.**

### How it runs

- Script: `promo/youtube-comments.mjs`
- Workflow: `.github/workflows/youtube-comments.yml`
- Schedule: **Every Friday, 10:00 UTC** (plus manual *Run workflow*)
- Each run:
  1. Searches YouTube for 6 portfolio/tracker queries → collects up to 20 unique videos
  2. Fetches top 20 comments per video → filters for tool-related questions
  3. Sends up to 30 candidates to Claude → drafts contextual replies
  4. Saves evaluated comment IDs to `promo/youtube-seen.json` (never shown again)
  5. If any drafts exist, writes `promo/youtube-issue.json` → workflow opens a GitHub Issue

### Required setup

**`ANTHROPIC_API_KEY`** — already used by the Reddit/blog agents.

**`YOUTUBE_API_KEY`** — YouTube Data API v3 key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Navigate to **APIs & Services → Library** and enable **YouTube Data API v3**
4. Navigate to **APIs & Services → Credentials → Create Credentials → API key**
5. (Optional but recommended) Restrict the key to YouTube Data API v3
6. Add it as a **repository secret** named `YOUTUBE_API_KEY`
   (Settings → Secrets and variables → Actions → New repository secret)

The free YouTube Data API v3 quota is 10,000 units/day. Each search costs 100
units; fetching comments costs 1 unit per request. A full run uses roughly
700–800 units, well within the free daily limit.

### Tuning

- Search queries: the `QUERIES` array in `youtube-comments.mjs`
- Comment filter keywords: the `COMMENT_KEYWORDS` array in `youtube-comments.mjs`
- Frequency: the `cron` in `youtube-comments.yml`
