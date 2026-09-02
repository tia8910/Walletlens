# Ready-to-Post Reddit Content

## Post 1: r/opensource (Show & Tell)

**Title:** I built a privacy-first portfolio tracker — zero accounts, zero tracking, open source

**Body:**
I've been working on WalletLens for a few months and wanted to share it with the community.

**What it does:**
- Track crypto, stocks, gold, silver, real estate, and cash
- AI-powered analysis (Magic Indicator fuses 5 signal types)
- Voice import — say your holdings and AI parses them
- Screenshot import — screenshot your exchange app, AI reads it
- Tax report export for Koinly/CoinTracker/TurboTax
- Price alerts even when the app is closed

**Privacy model:**
- Zero accounts — no sign-up, no email
- Zero tracking — no analytics, no data collection
- Zero cloud — all data in localStorage/IndexedDB
- Open source — verify every line

**Tech stack:**
React + Vite, hosted on Cloudflare Pages, AI via Deno Deploy. 1,500+ tests.

GitHub: https://github.com/tia8910/Walletlens
Live: https://walletlens.live

Would love feedback from the community!

---

## Post 2: r/privacy

**Title:** WalletLens: Portfolio tracker that never asks for your email, stores your data on servers, or tracks you

**Body:**
Every portfolio tracker I tried had the same problems:
1. Required an account just to track my own money
2. Stored my financial data on their servers
3. Tracked my behavior with analytics

So I built WalletLens — a free, open-source portfolio tracker that respects your privacy.

**Privacy features:**
- No account required
- No data leaves your device
- No analytics or tracking
- Open source — verify every line
- Works offline

**App features:**
- Track crypto, stocks, gold, silver, real estate, cash
- AI analysis and voice import
- Price alerts
- Export to Excel/CSV

GitHub: https://github.com/tia8910/Walletlens
Live: https://walletlens.live

---

## Post 3: r/selfhosted

**Title:** WalletLens — Self-hosted portfolio tracker with AI analysis (Docker/PWA)

**Body:**
WalletLens is a free, open-source portfolio tracker that runs entirely in your browser. No server, no database, no accounts.

**How it works:**
- Static React app hosted on Cloudflare Pages (or self-hosted)
- All data in localStorage/IndexedDB
- AI features via Deno Deploy endpoint (optional)
- Works fully offline as PWA

**Features:**
- Crypto, stocks, gold, silver, real estate tracking
- AI Magic Indicator (5-signal composite)
- Voice and screenshot import
- Tax report export
- Price alerts

**Self-hosting:**
```bash
git clone https://github.com/tia8910/Walletlens.git
cd Walletlens/client
npm install
npm run build
# Serve the dist/ folder with any static server
```

GitHub: https://github.com/tia8910/Walletlens

---

## Post 4: r/javascript

**Title:** Built a portfolio tracker with React + Vite — 1,500+ tests, AI analysis, privacy-first

**Body:**
Sharing a project I've been working on — WalletLens, a free, open-source portfolio tracker.

**Technical highlights:**
- React 18 + React Router 6 + Recharts + Vite
- 1,500+ Vitest tests across 75 test files
- Lazy loading with code splitting
- Service worker with tiered caching (offline-first)
- Custom TA math engine (RSI, MACD, Bollinger, S/R)
- AI Magic Indicator — fuses 5 signal types
- Capacitor for Android native shell
- Cloudflare Pages hosting

**Privacy architecture:**
- 100% client-side — no backend
- localStorage/IndexedDB for data
- Public API calls only for prices
- Optional Claude AI endpoint

GitHub: https://github.com/tia8910/Walletlens

---

## Post 5: HackerNews

**Title:** Show HN: WalletLens – Free, open-source portfolio tracker with AI analysis

**URL:** https://github.com/tia8910/Walletlens

**Comment:**
Hey HN,

I built WalletLens — a privacy-first, open-source portfolio tracker.

The problem: every tracker requires an account, stores your financial data on their servers, and often sells it.

WalletLens is different:
- Zero accounts — no sign-up
- Zero tracking — no analytics
- Zero cloud — all data in your browser
- Open source — verify every line

Features:
- Track crypto, stocks, gold, silver, real estate, cash
- AI Magic Indicator — fuses 5 signal types into one direction per holding
- Voice import — "I bought 0.5 BTC at 65K" parsed by AI
- Screenshot import — screenshot your exchange app, AI reads holdings
- Portfolio Guardian — anomaly detection
- Tax report export
- Works offline as PWA

Built with React + Vite, hosted on Cloudflare Pages. The AI uses Claude via a tiny Deno Deploy function.

Would love feedback from the HN community.
