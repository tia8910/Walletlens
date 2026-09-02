<div align="center">

<a href="https://walletlens.live">
<img src="https://walletlens.live/icon-512.png" alt="WalletLens Logo" width="120" height="120" />
</a>

# 🔒 WalletLens

### The free, private, no-account portfolio tracker with AI analysis

Track **crypto, stocks, gold, real estate and cash** in one unified net-worth dashboard.  
**Add holdings by voice, screenshot, Excel/CSV or wallet address — then export to Excel or a tax-ready CSV.**  
Live P&L · Technical Analysis · Magic Indicator · AI Coach

---

[![Live App](https://img.shields.io/badge/🌐%20Try%20It%20Now-walletlens.live-00c853?style=for-the-badge&logo=vercel&logoColor=white)](https://walletlens.live)
[![Google Play](https://img.shields.io/badge/📱%20Google%20Play-Download-414141?style=for-the-badge&logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=live.walletlens.twa)
[![Stars](https://img.shields.io/github/stars/tia8910/Walletlens?style=for-the-badge&color=fbbf24&label=⭐%20Stars&logo=github)](https://github.com/tia8910/Walletlens/stargazers)
[![Forks](https://img.shields.io/github/forks/tia8910/Walletlens?style=for-the-badge&color=60a5fa&logo=github)](https://github.com/tia8910/Walletlens/forks)
[![License](https://img.shields.io/github/license/tia8910/Walletlens?style=for-the-badge&color=a78bfa)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Installable-3b82f6?style=for-the-badge)](https://walletlens.live)
[![Deploy](https://img.shields.io/github/actions/workflow/status/tia8910/Walletlens/deploy.yml?style=for-the-badge&label=Deploy&logo=github-actions)](https://github.com/tia8910/Walletlens/actions)

<br>

**⚠️ Most portfolio trackers require an account and sell your data.**  
**WalletLens is different: zero accounts, zero tracking, zero cloud.**  
**Your portfolio data never leaves your device. Period.**

> ⭐ **If this helps you, a star helps others find it — thank you!** ⭐

</div>

---

## 🎯 One-Line Pitch

> *"A free, open-source, privacy-first portfolio tracker that supports crypto, stocks, gold, silver, real estate and cash — with AI analysis, voice import, and zero accounts."*

---

## 📊 Why WalletLens?

| | WalletLens | CoinGecko | Delta | CoinStats |
|---|:---:|:---:|:---:|:---:|
| **Account required** | ❌ None | ✅ Yes | ✅ Yes | ✅ Yes |
| **Data leaves device** | ❌ Never | ✅ Yes | ✅ Yes | ✅ Yes |
| **Free forever** | ✅ | ⚠️ Freemium | ⚠️ Freemium | ⚠️ Freemium |
| **Stocks + Gold + Crypto** | ✅ | ❌ Crypto only | ⚠️ Limited | ❌ Crypto only |
| **AI Voice Import** | ✅ | ❌ | ❌ | ❌ |
| **AI Screenshot Import** | ✅ | ❌ | ❌ | ❌ |
| **Tax Report Export** | ✅ Free | ❌ | 💰 Paid | 💰 Paid |
| **Open Source** | ✅ | ❌ | ❌ | ❌ |
| **Works Offline** | ✅ | ❌ | ❌ | ❌ |
| **AI Analysis** | ✅ Free | ❌ | ❌ | 💰 Paid |

---

## ✨ Features That No Other Free Tracker Has

### 🎙️ Voice Import
> Say: *"I bought half a Bitcoin at 65K and twenty Apple shares"*
> WalletLens parses multiple trades from one sentence. English & Arabic.

### 📸 Screenshot Import
> Screenshot your holdings from **any** exchange, broker or wallet (Binance, Coinbase, MetaMask, Robinhood — even a handwritten list) and AI reads each asset.

### 📄 Excel/CSV Import + Export
> Bulk-import from spreadsheets. Export to Excel, CSV, or tax-ready transaction CSV for Koinly/CoinTracker/TurboTax.

### 🔗 Wallet Address Import
> Paste any ETH, BTC or Solana address — auto-fetches live balances. No API key.

### 🤖 AI Magic Indicator
> One composite signal per holding merging **5 pillars**: technical, on-chain, volume, whale flow, and fundamentals. Shows: 🟢 Strong Buy → 🔴 Distribute.

### 🛡️ Portfolio Guardian
> AI monitors your holdings for anomalies, concentration risk, and volatility spikes.

### 💰 Zakat Calculator
> Auto-calculate 2.5% Nisab with live gold/silver prices. Multi-currency support.

---

## 📸 Screenshots

<div align="center">

| Dashboard | Analysis | Goals |
|:---:|:---:|:---:|
| ![Dashboard](https://walletlens.live/og-image.png) | | |

**[🌐 See the live app →](https://walletlens.live)**

</div>

---

## 🚀 Quick Start

### Web (Instant)
1. Open [walletlens.live](https://walletlens.live)
2. Click "Install" to add to your home screen
3. Start adding holdings — no account needed!

### Android App
[![Google Play](https://img.shields.io/badge/📱%20Download%20on%20Google%20Play-414141?style=for-the-badge&logo=google-play)](https://play.google.com/store/apps/details?id=live.walletlens.twa)

### Developer
```bash
git clone https://github.com/tia8910/Walletlens.git
cd Walletlens/client
npm install
npm run dev        # → http://localhost:5173
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · React Router 6 · Recharts · Vite |
| Storage | localStorage / IndexedDB — **100% client-side** |
| Hosting | Cloudflare Pages (custom domain `walletlens.live`) |
| AI | Claude `claude-sonnet-4-6` via Deno Deploy |
| Mobile | Capacitor (Android native shell) |
| Tests | Vitest (1,500+ tests) |

### Live Data Sources (all free, no API key)
**Crypto:** CoinGecko · Binance · CryptoCompare · CoinCap  
**Stocks:** Stooq · Yahoo Finance  
**Metals:** gold-api.com  
**FX/Fiat:** open.er-api · Frankfurter (ECB)

---

## 🗂️ Project Structure

```
Walletlens/
├── client/                    # React + Vite app
│   └── src/
│       ├── pages/             # Dashboard, Technicals, Whales, Vision, Coach…
│       ├── components/        # TradeSheet, MagicAnalysisPanel, VoiceImport…
│       ├── api.js             # Data layer: prices, portfolio, signals
│       ├── technicals.js      # Pure TA math (RSI, MACD, Bollinger, S/R)
│       ├── magicIndicator.js  # Five-pillar composite → direction + confidence
│       └── magicAi.js         # Claude AI verdict per asset
├── voice-api/                 # Deno Deploy endpoint (voice + AI)
├── scripts/                   # Static prerender for SEO
└── .github/workflows/         # Deploy, price/news updaters, social posting
```

---

## 🔒 Privacy

> **Your portfolio data never leaves your device.**

- ❌ No accounts, no sign-ups
- ❌ No analytics, no tracking
- ❌ No cloud storage
- ❌ No third-party data sharing
- ✅ All data stored locally (localStorage/IndexedDB)
- ✅ Open source — verify every line of code
- ✅ Works fully offline

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

- 🐛 **Bug?** [Open an issue](https://github.com/tia8910/Walletlens/issues/new?template=bug_report.yml)
- 💡 **Feature idea?** [Request it](https://github.com/tia8910/Walletlens/issues/new?template=feature_request.yml)
- 🔀 **PR?** Fork → Branch → PR → Merge

---

## 📚 Related Links

| Resource | Link |
|---|---|
| 🌐 Live App | [walletlens.live](https://walletlens.live) |
| 📱 Google Play | [Download](https://play.google.com/store/apps/details?id=live.walletlens.twa) |
| 📖 Blog | [walletlens.live/blog](https://walletlens.live/blog) |
| 🎓 Academy | [walletlens.live/academy](https://walletlens.live/academy) |
| 📊 Fear & Greed | [walletlens.live/fear-and-greed-index](https://walletlens.live/fear-and-greed-index) |
| 🐋 Whale Tracker | [walletlens.live/whales](https://walletlens.live/whales) |
| 🎙️ Voice Import | [walletlens.live/add-holdings-by-voice](https://walletlens.live/add-holdings-by-voice) |
| 📸 Screenshot Import | [walletlens.live/import-portfolio-from-screenshot](https://walletlens.live/import-portfolio-from-screenshot) |

---

## ⚠️ Disclaimer

WalletLens is a tracking and analysis tool — **not financial advice**. Indicators, sell plans and AI verdicts are informational only. Always do your own research.

---

<div align="center">

**[walletlens.live](https://walletlens.live) · [Telegram](https://t.me/walletlenss) · [Twitter/X](https://x.com/wallet_lens) · [YouTube](https://youtube.com/@walletlens)**

Made with ❤️ — Free forever, open source, private by design.

### ⭐ If WalletLens helps you manage your wealth, please star this repo — it helps others discover it! ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=tia8910/Walletlens&type=Date)](https://star-history.com/#tia8910/Walletlens&Date)

</div>
