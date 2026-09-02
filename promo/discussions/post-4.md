## The Problem

Almost every Android app uses Firebase Cloud Messaging (FCM) for push notifications. But FCM requires a Google account, sends device IDs to Google, and lets servers track which device received which message.

If you care about privacy, you cannot use FCM directly.

---

## Our Approach

WalletLens sends push notifications **without Firebase tracking**:

1. **Cloudflare Worker** — We run a lightweight edge function that decides what notifications to send
2. **FCM with HIGH priority** — We use FCM only for delivery (wakes device out of Doze), but:
   - No user accounts
   - No device fingerprinting
   - No personal data in the payload
3. **Web Push API** — For the PWA version, we use the browser native push API
4. **Local scheduling** — Feature tips and reminders are generated locally on your device

---

## What Gets Sent

- Price alerts for your specific holdings (5% movement)
- Portfolio Guardian anomaly alerts
- Feature tips and investment hacks
- Weekly performance reports

All of this is triggered by market data, not by your behavior.

---

## What Does NOT Get Sent

- No ads
- No promotional messages
- No cross-device tracking
- No analytics events

---

**Your portfolio is yours. Your notifications are yours.**

Try it: [walletlens.live](https://walletlens.live) | [Google Play](https://play.google.com/store/apps/details?id=live.walletlens)
