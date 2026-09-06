---
title: "How I Built a Privacy-First Portfolio Tracker — No Account, No Server, All Local"
published: true
description: "A deep dive into building a net worth tracker that covers crypto, stocks, gold, and cash — with AI analysis, voice import, and zero data collection."
tags: react, javascript, webdev, privacy
canonical_url: https://dev.to/walletlens/how-i-built-a-privacy-first-portfolio-tracker-no-account-no-server-all-local
cover_image: https://walletlens.live/og-image.png
---

# How I Built a Privacy-First Portfolio Tracker — No Account, No Server, All Local

Every portfolio tracker wants your email, your password, and access to your exchange accounts. Then they sell your financial data to advertisers. I got tired of that.

So I built **[WalletLens](https://walletlens.live)** — a net worth tracker that stores everything in your browser's `localStorage`. No account. No cloud. No tracking.

## The Problem

Most finance apps follow this pattern:

1. **Sign up** with email + password
2. **Connect** your bank/exchange accounts (or manually enter holdings)
3. **Trust** them with your complete financial picture
4. **Hope** they don't sell it (spoiler: [they do](https://www.ftc.gov/news-events/news/press-releases/2024/03/ftc-takes-action-against-mint-credit-karma-unfair-deceptive-practices-involving-tax-filing-products))

Even "privacy-focused" alternatives like CoinStats and Kubera still require accounts and store your portfolio on their servers.

## The Solution: Zero-Trust Architecture

WalletLens has **zero backend**. Here's what that means technically:

```javascript
// All data lives in localStorage
const portfolio = JSON.parse(localStorage.getItem('wl_portfolio') || '[]');

// Prices come from public APIs — no auth needed
const prices = await fetch('https://api.coingecko.com/api/v3/simple/price?...');

// AI analysis runs through a CORS proxy — no data stored
const analysis = await fetch('/api/ai-verdict', { body: JSON.stringify(holdings) });
```

Your portfolio data **never leaves your device**. The server (Cloudflare Pages) only serves static files — it has no database, no user accounts, no analytics.

## Features I'm Proud Of

### 🎙️ Voice Import
Say "I bought 0.5 BTC at 65K and 10 ETH at 3500" and AI parses it into structured holdings. Works in 6 languages.

### 📸 Screenshot Import
Screenshot your exchange app (Binance, Coinbase, etc.) and AI reads the holdings directly from the image. No API keys needed.

### 🤖 Magic Indicator
This was the hardest feature. It fuses **five signal types** into one direction per holding:

1. **Technical** — RSI, MACD, Bollinger Bands, Moving Averages
2. **On-chain** — whale activity, exchange flows
3. **Volume** — OBV, VWAP, volume divergence
4. **Whales** — large wallet movements
5. **Fundamentals** — market cap, TVL, TVD ratio

Each signal votes independently, then they're weighted and combined into a single score: **Bullish**, **Bearish**, or **Neutral**.

### 🛡️ Portfolio Guardian
Monitors your holdings for:
- Concentration risk (too much in one asset)
- Unusual volatility
- Stale prices (data feed failures)
- Correlation clustering

### 📊 Technical Analysis (for ALL Assets)
Not just crypto. Stocks, gold, silver — every asset gets full technical analysis with:
- RSI, MACD, Bollinger Bands, Moving Averages
- Support/resistance levels
- Direction prediction with confidence score

## Tech Stack

- **Frontend**: React 18 + Vite
- **Styling**: Custom CSS (no framework — 100% mobile-first)
- **State**: React hooks + localStorage
- **AI**: Claude via Cloudflare Workers
- **Hosting**: Cloudflare Pages (free tier)
- **Mobile**: Android TWA (Trusted Web Activity)
- **Data**: CoinGecko API, Yahoo Finance, Stooq, RSS feeds

## What I Learned

1. **localStorage is enough** for most personal finance apps. You don't need a database if the user is the only person who needs the data.

2. **AI changes everything for privacy apps**. You can get smart analysis without storing user data — send it to AI, get the result, discard the input.

3. **PWA + TWA = native app without the app store**. WalletLens is installable on both desktop and Android without going through app review (though I did publish on Google Play too).

4. **No analytics = harder growth**. I can't track conversion rates or user retention. But that's the point.

## Try It

👉 **[walletlens.live](https://walletlens.live)** — no sign-up, no tracking, all local

📦 **[GitHub](https://github.com/tia8910/Walletlens)** — MIT licensed, contributions welcome

📱 **[Google Play](https://play.google.com/store/apps/details?id=live.walletlens.twa)** — Android app

---

*Built with ❤️ for people who believe their financial data belongs to them.*
