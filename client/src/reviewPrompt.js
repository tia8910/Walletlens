// Opens Google Play's in-app review card when the user asks for it.
//
// ── What is NOT here any more ──────────────────────────────────────────────
//
// The automatic prompt. All the rules that decided whether someone had used
// WalletLens enough to be worth asking — session counts, install age, positive
// moments, failure cooldowns — used to live in this file, and none of it could
// ever fire.
//
// Sending the intent means navigating the top frame to a walletlens:// URL.
// Chrome refuses external-scheme navigation without a user activation, and an
// automatic ask is made from a timer, which has none. So every eligible ask was
// recorded as 'skipped-no-activation' and thrown away. Nothing logged, nothing
// threw, and the function returned false — indistinguishable from "not eligible
// yet". It looked half-working only because the button below always worked.
//
// The decision now lives in the Android shell, in ReviewGate.java, which runs
// in the same process as ReviewActivity and can start it directly with no
// bridge and no gesture required. See that file for the current rules.
//
// What stays here is the one path that always worked: the user tapping
// "Rate WalletLens" in Settings. A tap is a user activation, so the intent goes
// through.

import { isAndroidTWA, fireNativeIntent } from './nativeBridge'

/**
 * Open the review card because the user asked for it, rather than because the
 * app decided to ask.
 *
 * Falls back to the store listing if Play declines to show the card. That is
 * safe here and nowhere else: the user tapped a button and is expecting
 * something to happen, so landing on the listing is a worse outcome than the
 * card but a much better one than silence. The automatic path must never do
 * this — being thrown into the Play Store unannounced is exactly what the
 * in-app card exists to avoid.
 *
 * No-op outside the installed Android app.
 */
export function requestReviewNow(source = 'manual') {
  if (!isAndroidTWA()) return false
  return fireNativeIntent(
    'walletlens://review?fallback=store&source=' + encodeURIComponent(source)
  )
}
