# Reddit Post Templates — Space 24-48 Hours Apart

---

## Post 1: r/privacy (DA 90)

**Title**: "I built a portfolio tracker that requires no account — all data stays in your browser"

**Body**:
Hey r/privacy,

Every portfolio tracker (CoinStats, Kubera, Empower) requires an account and stores your financial data on their servers. I got tired of trusting companies with my complete financial picture.

So I built [WalletLens](https://walletlens.live) — a net worth tracker that runs entirely in your browser.

**How it works:**
- No account, no sign-up, no email
- All data stored in localStorage (never leaves your device)
- No analytics, no tracking, no cookies
- Open source (MIT) — verify every line

**What it tracks:**
- Crypto (10,000+ coins)
- US stocks + major indices
- Gold, silver, platinum, copper
- Fiat currencies and cash

**Privacy features:**
- Zero backend — the "server" is just static files on Cloudflare
- No database, no user accounts
- Even I (the developer) can't see your portfolio
- PWA — works offline
- Android app (TWA) — no native code, same client-side code

**AI features (optional):**
- Voice import — say your holdings, AI parses them
- Screenshot import — screenshot your exchange app, AI reads it
- Magic Indicator — 5-signal composite analysis
- Portfolio Guardian — anomaly detection

The tradeoff: no auto-sync with exchanges (manual entry only), no cross-device sync. But your data stays yours.

Try it: https://walletlens.live
GitHub: https://github.com/tia8910/Walletlens

---

## Post 2: r/cryptocurrency (DA 90)

**Title**: "Built a privacy-first crypto portfolio tracker with AI Magic Indicator — free, no account"

**Body**:
Hey everyone,

I built [WalletLens](https://walletlens.live) — a crypto portfolio tracker that doesn't require an account or store your data on a server.

**Why I built it:**
Every crypto tracker requires API keys or exchange connections, which means your complete portfolio is sitting on someone else's server. I wanted something that runs entirely in my browser.

**Key features:**
- 🎙️ Voice import — "I bought 0.5 BTC at 65K" → parsed by AI
- 📸 Screenshot import — screenshot your Binance/Coinbase app → AI reads holdings
- 🤖 Magic Indicator — fuses technical, on-chain, volume, whale, and fundamental signals into one direction per holding
- 🛡️ Portfolio Guardian — monitors for concentration risk, volatility, and stale prices
- 📊 Full technical analysis for every asset (RSI, MACD, Bollinger, MAs)

**Privacy:**
- Zero accounts, zero tracking, zero cloud
- All data in localStorage — never leaves your device
- Open source (MIT) on GitHub

**Tracks:** Crypto (10,000+ coins), US stocks, gold, silver, fiat, cash

It's not a replacement for a DEX — it's a tracker. But it's the only tracker that doesn't require you to trust anyone with your data.

https://walletlens.live

---

## Post 3: r/personalfinance (DA 90)

**Title**: "Free net worth tracker that doesn't sell your data — no account required"

**Body**:
I've been using various net worth trackers for years (Mint, Empower, CoinStats). The problem? They all require accounts, store your financial data on their servers, and most sell it.

I built [WalletLens](https://walletlens.live) as an alternative:

- **No account** — just open the site and start tracking
- **No data collection** — everything stays in your browser's localStorage
- **No tracking** — no analytics, no cookies, no fingerprinting
- **Free** — no premium tier, no paywall
- **Multi-asset** — crypto, stocks, gold, silver, fiat, cash

**What you get:**
- Real-time P&L with 24h changes
- AI portfolio analysis (risk score, diversification, momentum)
- Technical analysis for any asset
- Tax report export (CSV)
- Excel import/export
- Works offline as a PWA

**Tradeoffs:**
- Manual entry only (no bank/exchange connections)
- No cross-device sync
- No auto price alerts (but you can set manual ones)

For me, the privacy is worth the manual entry. My financial picture is nobody's business but mine.

https://walletlens.live
https://github.com/tia8910/Walletlens

---

## Post 4: r/webdev (DA 90)

**Title**: "Built a 6000-line React finance app with AI — open source, no backend"

**Body**:
Hey r/webdev,

I built [WalletLens](https://walletlens.live) — a full-featured net worth tracker built with React + Vite. It's open source (MIT) and has zero backend.

**Technical highlights:**
- 6000+ lines of React across 20+ routes
- All state in React hooks + localStorage (no Redux, no Zustand)
- AI integration via Cloudflare Workers (Claude API)
- PWA with service worker for offline support
- TWA (Trusted Web Activity) for Android app
- Code-split with lazy loading per route
- Prerendering for SEO
- Custom CSS (no Tailwind, no Bootstrap) — fully responsive

**Interesting challenges:**
- Real-time price updates from CoinGecko + Yahoo Finance + Stooq
- Voice import with natural language parsing (multilingual)
- Screenshot OCR for exchange app screenshots
- "Magic Indicator" that fuses 5 signal types per asset
- Portfolio heatmaps with animated SVGs
- 24/7 news ticker from RSS feeds

**Architecture:**
- Frontend: React 18 + Vite
- Hosting: Cloudflare Pages (free tier)
- Data: Cloudflare Workers (cron jobs for market data)
- No database, no user accounts
- All user data in localStorage

https://github.com/tia8910/Walletlens
https://walletlens.live

---

## Post 5: r/selfhosted (DA 85)

**Title**: "Client-side portfolio tracker — no server, no database, no account"

**Body**:
I know r/selfhosted is usually about Docker containers and NAS setups, but hear me out.

[WalletLens](https://walletlens.live) is a portfolio tracker that needs **no server at all**. It's entirely client-side — all data lives in the browser's localStorage.

**Why this matters for self-hosters:**
- You can host it on any static file server (Nginx, Caddy, even a USB stick)
- No database to maintain, no API keys to rotate
- The "server" is just HTML/CSS/JS files
- Works offline via service worker

**Self-hosting is trivial:**
```bash
git clone https://github.com/tia8910/Walletlens.git
cd Walletlens/client
npm install
npm run build
# Copy dist/ to your web server
```

Or just open `dist/index.html` directly — it works as a local file too.

**What it tracks:** Crypto, stocks, gold, silver, fiat, cash

**What it doesn't do:** Auto-sync with exchanges (by design — that would require API keys on a server)

https://github.com/tia8910/Walletlens

---

## Post 6: r/ethfinance (DA 70)

**Title**: "Multi-asset crypto tracker with on-chain whale detection — free, no account"

**Body**:
Built [WalletLens](https://walletlens.live) — tracks crypto alongside stocks, gold, and fiat in one dashboard.

**Crypto-specific features:**
- On-chain whale activity tracking
- Exchange flow monitoring
- DeFi TVL/TVD analysis
- 10,000+ coins via CoinGecko
- Technical analysis per holding (RSI, MACD, Bollinger, MAs)
- Magic Indicator: fuses technical + on-chain + volume + whale + fundamentals

**Privacy:** Zero accounts, all data in localStorage, open source.

https://walletlens.live
