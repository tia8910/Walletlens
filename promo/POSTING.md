# One-Click Posting

After the Reddit and YouTube agents drop their draft replies into a GitHub
Issue, you review them and post the ones you like with a single workflow run.
Nothing is ever posted without you triggering it.

A `skip_drafts` input (e.g. `2,4`) lets you exclude specific drafts before
posting, and both workflows auto-close the draft issue once every draft is
handled.

---

## Reddit — `Post Reddit Drafts`

Script: `promo/post-reddit-drafts.mjs` · Workflow: `.github/workflows/post-reddit.yml`

### Setup (one time)

1. Go to **https://www.reddit.com/prefs/apps** → *create another app*
2. Choose type **script**, set the redirect URI to `http://localhost:8080` (unused)
3. Note the **client ID** (shown under the app name) and the **client secret**
4. Add four repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `REDDIT_CLIENT_ID` | client ID from step 3 |
| `REDDIT_CLIENT_SECRET` | client secret from step 3 |
| `REDDIT_USERNAME` | your Reddit account username |
| `REDDIT_PASSWORD` | your Reddit account password |

### Posting

1. **Actions → Post Reddit Drafts → Run workflow**
2. Optionally set the issue number and any draft numbers to skip
3. **Run workflow**

Each draft is posted as a top-level comment on its Reddit thread.

---

## YouTube — `Post YouTube Drafts`

Script: `promo/post-youtube-drafts.mjs` · Workflow: `.github/workflows/post-youtube.yml`

Posting comments requires OAuth2 (not just the read-only API key the discovery
agent uses), so the account posts as you.

### Setup (one time)

**Step 1 — Create OAuth2 credentials in Google Cloud Console:**
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type **Desktop app**
3. Add `http://localhost:3000` under **Authorized redirect URIs**
4. Copy the **Client ID** and **Client Secret**

**Step 2 — Get a refresh token (run locally once):**
```bash
YOUTUBE_OAUTH_CLIENT_ID=<your-client-id> \
YOUTUBE_OAUTH_CLIENT_SECRET=<your-client-secret> \
node promo/youtube-oauth.mjs
```
Open the printed URL, log in with the YouTube account you want to post from, and
grant permission. The script prints your refresh token.

**Step 3 — Add three repository secrets:**

| Secret | Value |
|--------|-------|
| `YOUTUBE_OAUTH_CLIENT_ID` | OAuth2 client ID |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | OAuth2 client secret |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | refresh token from step 2 |

### Posting

1. **Actions → Post YouTube Drafts → Run workflow**
2. Optionally set the issue number and any draft numbers to skip
3. **Run workflow**

Each draft is posted as a reply to the original YouTube comment.

> **Quota:** posting a comment (`comments.insert`) costs 50 YouTube API units.
> Eight replies = 400 units — well within the 10,000-unit free daily limit.
