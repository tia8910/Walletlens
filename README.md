# WalletLens

**A 100% free, no-account, privacy-first all-asset portfolio tracker.**
Track crypto, US stocks, precious metals, fiat and real estate in one unified net-worth dashboard — with AI insights, technical analysis and live prices. All your data stays on your device.

🔗 **Live:** [walletlens.live](https://walletlens.live)

---

## Why WalletLens

- **Free forever** — no paid tier, no ads, no upsells.
- **No account** — no sign-up, email, or wallet connection. Open it and start tracking.
- **Private by design** — all portfolio data lives in your browser (localStorage / IndexedDB). Nothing about your holdings is ever sent to a server.
- **All assets, one place** — crypto, stocks, gold/silver/platinum/copper, fiat currencies, real estate and cash.
- **Installable PWA** — works on iOS, Android and desktop, with offline support.
- **Bilingual** — full English and Arabic (RTL) UI.

## Features

### Portfolio
- **Net-worth dashboard** broken down by asset category (Crypto · Metals · Stocks · Real Estate · Cash) with allocation donut, category cards and per-category P&L.
- **Multi-wallet** — track several wallets and view net worth per wallet or combined.
- **Transaction tracking** with average cost, realized/unrealized P&L and performance over time.
- **Excel / CSV import** to bulk-load history from any exchange, plus a backup/restore code.

### Analysis & AI
- **Technical analysis** — per-holding RSI, MACD, Bollinger Bands, moving averages, ATR, trend and support/resistance, computed from daily candles.
- **Magic Indicator** — one direction per crypto holding (Strong Buy → Distribute) that merges **five** signals: technical, on-chain (flow/turnover/supply proxies), volume, whale accumulation and fundamentals — with a confidence score.
- **Smart sell plans** — exit ladders generated from real support/resistance, RSI, MACD and trend.
- **AI Coach & Alpha** — portfolio risk analysis, concentration flags and trade ideas.
- **Voice / typed import** — say *"I bought 1 Bitcoin and 1 Ethereum"* in English or Arabic; Claude parses multiple trades from one sentence.
- **Optional AI Verdict** — a Claude-written thesis (bull/bear + next action) per asset.

### Markets
- **Live market overview**, trending coins, Fear & Greed index and news.
- **Whale tracker** — live large on-chain BTC/ETH transactions and exchange flows.
- **Smart alerts** — price alerts delivered as PWA push notifications.
- **Academy** — beginner-friendly investing & crypto lessons.

## Tech stack

- **Frontend:** React 18, React Router 6, Recharts, Vite
- **State / storage:** client-side only (localStorage / IndexedDB) — no backend required
- **Hosting:** GitHub Pages (static `client/dist`, published to the `gh-pages` branch)
- **AI:** Claude (`claude-sonnet-4-6`) via a tiny serverless endpoint that keeps the API key server-side
- **Tests:** Vitest

### Live data sources (all free, no key required)
Crypto: CoinGecko, Binance, CryptoCompare, CoinCap · Stocks: Stooq, Yahoo Finance · Metals: gold-api · Fiat/FX: open.er-api, Frankfurter (ECB). Each has cascading fallbacks so the app never paints blank.

## Project structure

```
client/            # The app (React + Vite) — this is what ships to production
  src/
    pages/         # Dashboard, Market, Whales, Alpha, Coach, Technicals, AssetDetail, …
    components/    # TradeSheet, AISellPlan, VoiceImport, CoinLogo, …
    api.js         # Data layer: prices, portfolio, signals, fundamentals (localStorage-backed)
    technicals.js      # Pure TA math (RSI, MACD, Bollinger, S/R, trend)
    magicIndicator.js  # Five-pillar composite → direction + confidence
    magicAi.js / voiceAi.js  # Calls to the serverless Claude endpoint
voice-api/         # Deno Deploy serverless endpoint (voice parsing + Magic AI verdict)
scripts/           # Static prerender for SEO/AEO
.github/workflows/ # deploy.yml (gh-pages), price/news updaters
server/            # Legacy Express/SQLite server — optional local exchange sync only
```

## Quick start

```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

Build & test:

```bash
npm run build        # vite build + static prerender → client/dist
npm test             # vitest
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds `client/`
and publishes `client/dist` to the `gh-pages` branch. The custom domain is set
via `CNAME` (`walletlens.live`).

## Optional: the AI endpoint

Smart voice/typed import and the Magic Indicator's AI Verdict are powered by
Claude. Because the site is static, the Anthropic key can't live in the bundle —
it sits as an env secret in a small [Deno Deploy](https://deno.com/deploy)
function in [`voice-api/`](voice-api/). See [`voice-api/README.md`](voice-api/README.md)
to deploy your own. If the endpoint is absent, the app falls back to its
on-device parser and the deterministic indicators — everything still works.

## Privacy

WalletLens does not collect, store or transmit your holdings. Portfolio data
never leaves your browser. The only outbound requests are to public market-data
APIs (for prices) and — only if you use voice import or the AI Verdict — the
Claude endpoint, which receives just the text/numbers needed for that one
feature and nothing about your identity.

## Disclaimer

WalletLens is a tracking and analysis tool, **not financial advice**. Indicators,
sell plans and AI verdicts are informational only. Do your own research.
