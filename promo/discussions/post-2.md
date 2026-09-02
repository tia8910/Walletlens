## The Problem

Most privacy-first apps cannot send push notifications because they do not use Firebase (which tracks users). So how do you get notified about price changes without sacrificing privacy?

---

## Our Solution

WalletLens uses a **lightweight Cloudflare Worker** that sends push notifications through FCM with `priority: HIGH`. This wakes the device out of Doze mode and delivers notifications **even when the app is fully closed**.

### What You Get Notified About

- 📈 **Price Alerts** — 5% or more movement on ANY asset in your holdings
- 🛡️ **Portfolio Guardian** — Anomaly and risk alerts
- 💡 **Investment Hacks** — Smart tips and strategies
- 🎓 **Feature Tips** — Discover features you have not used yet
- 📰 **Weekly Reports** — Portfolio performance summary
- 🌟 **New Features** — When we ship something new

### Deep-Linked Notifications

Every notification opens the **exact page** it is about:
- Price alert opens the asset detail page
- Guardian alert opens the risk analysis
- Feature tip opens the feature page

---

## How to Enable

1. Open WalletLens
2. Allow notifications when prompted
3. That is it — notifications work even when the app is closed

---

**No Firebase. No tracking. Just useful notifications.**

Try it: [walletlens.live](https://walletlens.live) | [Google Play](https://play.google.com/store/apps/details?id=live.walletlens.twa)
