---
title: "I Built a Privacy-First Portfolio Tracker — Zero Accounts, Zero Tracking, Open Source"
published: true
description: "How I built WalletLens, a free, open-source portfolio tracker that respects your privacy while providing AI-powered analysis."
tags: opensource, javascript, react, fintech
canonical_url: https://dev.to/walletlens
---

# I Built a Privacy-First Portfolio Tracker — Zero Accounts, Zero Tracking, Open Source

## The Problem

Every portfolio tracker I tried had the same issues:

1. **Account required** — Why do I need to create an account just to track my own money?
2. **Data stored on their servers** — My financial data sitting on someone else's database
3. **Analytics and tracking** — They know exactly what I'm looking at and when
4. **Freemium paywalls** — Basic features locked behind $10/month subscriptions

## The Solution

I built **WalletLens** — a free, open-source, privacy-first portfolio tracker.

### What Makes It Different

| Feature | WalletLens | Typical Tracker |
|---|---|---|
| Account required | ❌ None | ✅ Yes |
| Data leaves device | ❌ Never | ✅ Yes |
| Free forever | ✅ | ⚠️ Freemium |
| Open source | ✅ | ❌ |
| Works offline | ✅ | ❌ |

### Key Features

- **Track everything**: Crypto, stocks, gold, silver, real estate, cash
- **AI Voice Import**: Say "I bought 0.5 BTC at 65K" and AI parses it
- **Screenshot Import**: Screenshot your exchange app, AI reads your holdings
- **Magic Indicator**: Fuses 5 signal types into one direction per holding
- **Portfolio Guardian**: AI monitors for anomalies and risk
- **Tax Report Export**: Ready for Koinly, CoinTracker, TurboTax
- **Price Alerts**: Even when the app is closed

### Tech Stack

- React 18 + Vite
- localStorage / IndexedDB (100% client-side)
- Cloudflare Pages hosting
- Claude AI via Deno Deploy
- Capacitor for Android native

### Privacy Architecture

```
User → Browser → LocalStorage (data never leaves)
              ↓
         Public APIs (CoinGecko, Yahoo Finance) → Prices only
              ↓
         Claude AI (optional, text only) → Analysis
```

No accounts. No analytics. No tracking. Period.

## Try It

- **Live**: [walletlens.live](https://walletlens.live)
- **GitHub**: [github.com/tia8910/Walletlens](https://github.com/tia8910/Walletlens)
- **Google Play**: [Download](https://play.google.com/store/apps/details?id=live.walletlens.twa)

If you find it useful, ⭐ star the repo — it helps others discover it!

---

*Built with ❤️ — Free forever, open source, private by design.*
