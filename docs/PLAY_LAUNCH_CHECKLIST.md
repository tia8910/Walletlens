# Google Play (TWA) Launch Checklist

Status of the code-side fixes and the **manual steps that must be done by a
human** before/right after uploading to Play. Items marked ⚠️ cannot be fixed
from the repository — do them in Play Console / GitHub settings.

## 1. ⚠️ Rotate the leaked signing key (do this FIRST)

The upload keystore **and its password were committed to this repository**
(`walletlens_source/signing-key-info.txt`, `walletlens_source/source/signingKey.keystore`,
and a hardcoded password in `.github/workflows/build-aab.yml`). The files are
now deleted and the workflow reads secrets, but **git history still contains
them** and anyone who ever cloned the repo has the key.

1. Confirm **Play App Signing** is enabled (Play Console → Test and release →
   App integrity). It almost certainly is — the served `assetlinks.json`
   carries two fingerprints.
2. Request an **upload key reset** (App integrity → "Request upload key reset")
   and generate a brand-new keystore locally:
   `keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 9125`
3. Add the new keystore to GitHub secrets — never to the repo:
   - `KEYSTORE_BASE64` — `base64 -w0 upload.keystore`
   - `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`
4. Scrub the old key from git history (after merging this branch):
   `git filter-repo --invert-paths --path walletlens_source/source --path walletlens_source/signing-key-info.txt`
   then force-push and have collaborators re-clone. If the repo was ever
   public, treat the old key as permanently compromised regardless of the scrub.
5. Update the served `client/public/.well-known/assetlinks.json`: keep the
   **Play App Signing** certificate fingerprint (from App integrity) and
   replace the old upload-key fingerprint with the new one. Verify with
   https://developers.google.com/digital-asset-links/tools/generator —
   a wrong fingerprint makes the app open with a visible browser URL bar.

## 2. ⚠️ Play Console Data safety form

Declare exactly this (matches the app after this branch):

- **Collected:** Analytics — app interactions (Google Analytics via the web
  layer only; native Firebase Analytics has been removed).
- **NOT collected:** Advertising ID (the `AD_ID` permission is stripped with
  `tools:node="remove"`; the X/Twitter ads pixel is skipped inside the TWA),
  financial info, personal info, location. Portfolio data stays on-device.
- **Optional:** if users enable server push alerts, an anonymous push endpoint
  and their alert rules are stored by the push API. Mention it under app
  functionality if asked.
- Privacy policy URL: `https://walletlens.live/privacy`.

## 3. Firebase — removed (no action)

Firebase has been **removed entirely** (the `google-services` plugin,
`firebase-analytics` dependency, and stub `google-services.json` generation).
It was shipped with a stub config and had no real Firebase project, which made
Firebase's `FirebaseInitProvider` throw at process start — crashing the app on
first launch ("this app has a bug"). Native analytics is optional; the web
layer still reports to Google Analytics. If you ever want native Firebase back,
add a **real** `google-services.json` from a real project before re-adding the
plugin/dependency — never ship the stub.

## 4. $LENZ / airdrop pages are web-only

`/lenz` and `/airdrop` redirect to `/dashboard` inside the Play app
(`client/src/twa.js` + route gating in `App.jsx`) to stay clear of Play's
financial-features and contest policies. Nav links were already hidden.
**Do not re-enable them in the TWA** without legal/policy review. If Play
review still asks, the app is a *portfolio tracker*: no trading, no custody,
no token sales.

## 5. Versioning

`versionCode` must strictly increase with every Play upload. Current gradle
value: `versionCode 31` / `versionName 1.9.0`. The `build-aab.yml` workflow
inputs override both — always pass the next code (32, 33, …). There are no
misleading defaults anymore; the workflow requires explicit values.

## 6. Pre-submission smoke test

- [ ] `assetlinks.json` reachable at
      `https://walletlens.live/.well-known/assetlinks.json`, `application/json`,
      no redirect, contains the Play App Signing fingerprint.
- [ ] Install the release AAB via internal testing track: app opens
      full-screen (no URL bar), splash shows, `/dashboard` loads.
- [ ] Airplane mode → app still opens (service worker precache).
- [ ] `/lenz` and `/airdrop` typed into in-app navigation redirect to the
      dashboard; on the website they still work.
- [ ] Notifications: grant permission → periodic price notification arrives;
      reboot device → no "restored" notification spam.
- [ ] Play pre-launch report: no `NotificationAlarmReceiver` crashes (the
      ghost receiver was removed), no policy flags for `SCHEDULE_EXACT_ALARM`
      or `AD_ID` (both removed).

## 7. Known accepted trade-offs

- **Portrait lock** (manifest + TWA) hurts the large-screen/tablet quality
  score but is not a rejection. Revisit after launch with proper tablet CSS.
- **ads.txt / AdSense meta** stay for the website only. Never load AdSense
  inside the app — it violates AdSense program policy in Android apps.
- `/admin/mail` ships in the bundle; it is inert without the server-side
  `SIGNUP_EXPORT_TOKEN` and is noindexed.
