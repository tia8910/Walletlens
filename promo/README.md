# WalletLens Promotion Agent

Discovers Reddit posts and YouTube comments where someone is asking for a
**net-worth / portfolio / investment-tracking tool**, drafts honest helpful
replies, and delivers them as GitHub Issues. You review, then post with one
click — nothing is ever sent automatically.

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

- Search queries: the `prompt` in `find-and-draft.mjs`
- Frequency: the `cron` in `promote.yml`

## One-click posting — Reddit

Once you've reviewed the draft issue, post all replies with a single workflow run.

### Required setup (one time)

1. Go to **https://www.reddit.com/prefs/apps** → *create another app*
2. Choose type **script**, set redirect URI to `http://localhost:8080` (unused)
3. Note the **client ID** (shown under the app name) and **client secret**
4. Add four repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `REDDIT_CLIENT_ID` | client ID from step 3 |
| `REDDIT_CLIENT_SECRET` | client secret from step 3 |
| `REDDIT_USERNAME` | your Reddit account username |
| `REDDIT_PASSWORD` | your Reddit account password |

### How to post

1. Go to **Actions → Post Reddit Drafts → Run workflow**
2. Optionally enter the issue number and any draft numbers to skip
3. Click **Run workflow** — done

Drafts are posted as top-level comments on each Reddit thread. The issue is
automatically closed once all drafts are handled.

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

## One-click posting — YouTube

Once you've reviewed the draft issue, post all replies with a single workflow run.

### Required setup (one time)

You need OAuth2 credentials so the script can post comments as your YouTube account.

**Step 1 — Create OAuth2 credentials in Google Cloud Console:**
1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Choose application type **Desktop app**
3. Under **Authorized redirect URIs** add `http://localhost:3000`
4. Download or copy the **Client ID** and **Client Secret**

**Step 2 — Get a refresh token (run locally once):**
```bash
YOUTUBE_OAUTH_CLIENT_ID=<your-client-id> \
YOUTUBE_OAUTH_CLIENT_SECRET=<your-client-secret> \
node promo/youtube-oauth.mjs
```
Open the printed URL in your browser, log in with the YouTube account you want
to post from, and grant permission. The script prints your refresh token.

**Step 3 — Add three repository secrets:**

| Secret | Value |
|--------|-------|
| `YOUTUBE_OAUTH_CLIENT_ID` | OAuth2 client ID |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | OAuth2 client secret |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | refresh token from step 2 |

### How to post

1. Go to **Actions → Post YouTube Drafts → Run workflow**
2. Optionally enter the issue number and any draft numbers to skip
3. Click **Run workflow** — done

Each draft is posted as a reply to the original YouTube comment. The issue is
automatically closed once all drafts are handled.

> **Note:** posting `comments.insert` costs 50 API quota units per reply. Eight
> replies = 400 units — well within the 10,000-unit free daily limit.
