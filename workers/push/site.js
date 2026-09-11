// The origin every notification link resolves against.
//
// One constant, because three places have to agree on it and only one of them
// is in this repo's control at runtime:
//
//   • fcm.js makes payload urls absolute before handing them to FCM. Web Push
//     resolves a relative url against the page, but an FCM data message has no
//     page — without the prefix every notification opened the dashboard
//     instead of the asset it was about.
//   • WalletLensMessagingService.java refuses any url that does not start with
//     this exact string and falls back to /dashboard, so a mismatch here is
//     not a broken link, it is a silently wrong one.
//   • /health probes it, and a probe against a different host than the
//     notifications use would be a green light for something never tested.
export const SITE_ORIGIN = 'https://walletlens.live'
