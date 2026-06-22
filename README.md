<div align="center">

<img src="https://walletlens.live/icon-192.png" alt="WalletLens Logo" width="88" height="88" />

# WalletLens

### The free, private, no-account portfolio tracker with AI analysis

Track **crypto, stocks, gold, real estate and cash** in one unified net-worth dashboard.  
**Add holdings by voice, screenshot, Excel/CSV or wallet address — then export to Excel or a tax-ready CSV.**  
Live P&L · Technical Analysis · Magic Indicator · AI Coach

[![Live App](https://img.shields.io/badge/🌐%20Live%20App-walletlens.live-00c853?style=for-the-badge)](https://walletlens.live)
[![Stars](https://img.shields.io/github/stars/tia8910/Walletlens?style=for-the-badge&color=fbbf24&label=⭐%20Stars)](https://github.com/tia8910/Walletlens/stargazers)
[![Forks](https://img.shields.io/github/forks/tia8910/Walletlens?style=for-the-badge&color=60a5fa)](https://github.com/tia8910/Walletlens/forks)
[![Deploy](https://img.shields.io/github/actions/workflow/status/tia8910/Walletlens/deploy.yml?style=for-the-badge&label=Deploy)](https://github.com/tia8910/Walletlens/actions/workflows/deploy.yml)
[![License](https://img.shields.io/github/license/tia8910/Walletlens?style=for-the-badge&color=a78bfa)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Installable-3b82f6?style=for-the-badge)](https://walletlens.live)

> **⭐ If WalletLens helps you track your wealth, a GitHub star helps others find it — thank you!**

</div>

---

## Why WalletLens?

| | WalletLens | Most trackers |
|---|---|---|
| Account required | ❌ None | ✅ Sign-up required |
| Data leaves device | ❌ Never | ✅ Stored on servers |
| Free | ✅ Forever | ⚠️ Freemium / paywalled |
| Add holdings by | 🎙️ Voice · 📸 Screenshot · 📄 Excel/CSV · 🔗 Wallet address · ⌨️ Manual | ⌨️ Manual or exchange API only |
| Export | ✅ Excel/CSV + tax-ready transaction CSV | ⚠️ Often paywalled |
| Asset types | Crypto · Stocks · Metals · Real Estate · Cash | Usually crypto only |
| AI analysis | ✅ Built-in | ❌ Paid add-on |
| Offline support | ✅ PWA | ❌ |
| Open source | ✅ | ❌ |

---

## Features

### 📥 Smart Import & Export — the features no other tracker has
> You never have to type holdings one by one. WalletLens gives you **five ways to add holdings and two ways to export** — none of which require an account, an exchange API key, or a paid plan. Manual entry is *optional*, not the default.

- **🎙️ AI Voice Import (English & Arabic)** — say *"I bought half a Bitcoin at 65K and twenty Apple shares"* and Claude parses multiple trades from one sentence. The only free tracker with multilingual voice input. → [add-holdings-by-voice](https://walletlens.live/add-holdings-by-voice)
- **📸 AI Screenshot Import** — screenshot your holdings on **any** exchange, broker or wallet (Binance, Coinbase, MetaMask, Robinhood, a broker statement — even a handwritten list) and Claude vision reads each asset, amount and price into your portfolio. No API key, no connection. → [import-portfolio-from-screenshot](https://walletlens.live/import-portfolio-from-screenshot)
- **📄 Excel / CSV Import** — bulk-import your holdings or transaction history from a spreadsheet in seconds.
- **🔗 On-chain Wallet Import** — paste any Ethereum, Bitcoin or Solana address and WalletLens auto-fetches live balances. No API key.
- **⌨️ Manual Entry** — precise control when you want it, with exact dates and cost basis.
- **📤 Export to Excel / CSV** — download your full portfolio (holdings, cost basis, P&L, allocation) for Excel or Google Sheets. → [export-portfolio-to-excel](https://walletlens.live/export-portfolio-to-excel)
- **🧾 Crypto Tax Report Export** — export your complete transaction history as a CSV ready for Koinly, CoinTracker, TurboTax, or your accountant. → [crypto-portfolio-tax-report](https://walletlens.live/crypto-portfolio-tax-report)

### 📊 Portfolio Dashboard
- **All-asset net worth** — crypto, US stocks, gold/silver/platinum, fiat currencies, real estate and cash in one view
- **Live P&L** — realized/unrealized gains, average cost basis, and portfolio health score
- **Multi-wallet** — track multiple portfolios separately or combined
- **Performance charts** — 4H · 1D · 7D · 30D with real historical snapshots
- **Category breakdown** — allocation donut, per-category cards and sector heatmap

### 🤖 AI & Analysis
- **Magic Indicator** — one composite signal per holding (Strong Buy → Distribute) merging 5 pillars: technical, on-chain, volume, whale flow, and fundamentals
- **Technical Analysis** — RSI, MACD, Bollinger Bands, moving averages, ATR, support/resistance from daily candles
- **AI Sell Plans** — auto-generated exit ladders based on real S/R levels and momentum
- **Risk Scanner** — concentration risk, liquidity risk, and portfolio health insights
- **AI Coach** — personalized portfolio advice powered by Claude AI
- **Voice / typed import** — *"I bought 2 ETH at $3200 and 0.5 BTC"* — Claude parses multi-trade sentences in English or Arabic

### 🐋 Markets & Alerts
- **Whale tracker** — live large on-chain BTC/ETH moves and exchange flows
- **Price alerts** — PWA push notifications when targets are hit
- **Smart alerts** — volatility and momentum-based notifications
- **Live news** — crypto news feed with sentiment scoring
- **Fear & Greed index** — real-time market sentiment

### 🎯 Goals & Planning
- **Vision Goals** — bucket-based financial planning (Emergency Fund, Retirement, Down Payment…)
- **Price Targets** — per-asset take-profit and stop-loss targets
- **Goal completion tracking** — auto-detect when a bucket hits its target
- **Weekly Report** — shareable portfolio summary card

---

## Screenshots

| Dashboard | AI Analysis | Goals |
|:---:|:---:|:---:|
| [![Dashboard](https://walletlens.live/og-image.png)](https://walletlens.live) | | |

> 📸 **[See the live app →](https://walletlens.live)**

---

## Quick Start

```bash
git clone https://github.com/tia8910/Walletlens.git
cd Walletlens/client
npm install
npm run dev        # → http://localhost:5173
```

Build for production:
```bash
npm run build      # Vite build + static prerender → client/dist
npm test           # Vitest
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · React Router 6 · Recharts · Vite |
| Storage | localStorage / IndexedDB — **100% client-side, no backend** |
| Hosting | GitHub Pages (custom domain `walletlens.live`) |
| AI | Claude `claude-sonnet-4-6` via serverless Deno Deploy endpoint |
| Service Worker | Custom tiered caching (offline-first for assets, SWR for prices) |
| Tests | Vitest |

### Live data sources (all free, no API key required)
**Crypto:** CoinGecko · Binance · CryptoCompare · CoinCap  
**Stocks:** Stooq  
**Metals:** gold-api.com  
**FX/Fiat:** open.er-api · Frankfurter (ECB)

Each has cascading fallbacks — the app never shows a blank panel.

---

## Project Structure

```
Walletlens/
├── client/                    # React + Vite app (ships to production)
│   └── src/
│       ├── pages/             # Dashboard, Technicals, Whales, Vision, Coach…
│       ├── components/        # TradeSheet, MagicAnalysisPanel, VoiceImport…
│       ├── api.js             # Data layer: prices, portfolio, signals
│       ├── technicals.js      # Pure TA math (RSI, MACD, Bollinger, S/R)
│       ├── magicIndicator.js  # Five-pillar composite → direction + confidence
│       └── magicAi.js         # Claude AI verdict per asset
├── voice-api/                 # Deno Deploy serverless endpoint (voice + AI)
├── scripts/                   # Static prerender for SEO
└── .github/workflows/         # Deploy, price/news updaters, social posting
```

---

## AI Endpoint (Optional)

Voice import and the Magic AI Verdict use Claude. Since the app is fully static, the API key lives in a tiny [Deno Deploy](https://deno.com/deploy) function under [`voice-api/`](voice-api/). The app works fully without it — all TA indicators, P&L and portfolio tracking are 100% on-device.

---

## Privacy

WalletLens **never** collects, stores or transmits your holdings. Portfolio data never leaves your browser. The only outbound calls are to public market-data APIs for prices — and optionally the Claude endpoint for voice/AI features (it receives only the text you type, nothing about your identity or full portfolio).

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- 🐛 **Bug?** [Open an issue](https://github.com/tia8910/Walletlens/issues/new?template=bug_report.yml)
- 💡 **Feature idea?** [Request it here](https://github.com/tia8910/Walletlens/issues/new?template=feature_request.yml)
- ⭐ **Find it useful?** A star goes a long way!

---

## Disclaimer

WalletLens is a tracking and analysis tool — **not financial advice**. Indicators, sell plans and AI verdicts are informational only. Always do your own research.

---

<div align="center">

**[walletlens.live](https://walletlens.live) · [Telegram](https://t.me/walletlenss) · [Twitter/X](https://x.com/wallet_lens) · [YouTube](https://youtube.com/@walletlens)**

Made with ❤️ — Free forever, open source, private by design.

⭐ **Star this repo to help others discover WalletLens!** ⭐

</div>
