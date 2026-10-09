import { useState } from 'react'
import { useLanguage } from '../LanguageContext'
import { isAndroidApp } from '../nativeBridge'
import { requestReviewNow } from '../reviewPrompt'
import { track } from '../analytics'

// A plain "Rate WalletLens on Google Play" card on Home, for the Android app.
//
// The automatic review card is Google's: Play decides whether it appears at
// all and shows nothing once its per-user quota is spent, so many people
// never see it. This card is the way in that is always there. It asks no
// question first (Play forbids "enjoying the app?" funnels) and offers no
// reward; tapping it runs the same review flow, falling back to the store
// listing when Play declines to show the card.
//
// Shown as soon as there is a portfolio, from the first day. "Not now" waits
// three weeks; "Rate" ends it on this device.

const KEY = 'wl_rate_card'
const SNOOZE_MS = 21 * 24 * 60 * 60 * 1000

/** Whether the card is due. The arguments are there for tests. */
export function rateCardDue({ android = isAndroidApp(), holdings = 0, now = Date.now() } = {}) {
  if (!android || holdings < 1) return false
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'done' || Number(v) > now) return false
    return true
  } catch { return false }
}

export default function RateCard({ holdings = 0 }) {
  const { t } = useLanguage()
  const [shown, setShown] = useState(() => rateCardDue({ holdings }))
  if (!shown || !rateCardDue({ holdings })) return null
  const rate = () => {
    track('rate_tap', { source: 'home_card' })
    try { localStorage.setItem(KEY, 'done') } catch {}
    setShown(false)
    requestReviewNow('home_card')
  }
  const later = () => {
    track('rate_card_dismiss')
    try { localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS)) } catch {}
    setShown(false)
  }
  return (
    <section className="nl-rate-card" aria-label={t('rcTitle')}>
      <div className="nl-rate-stars" aria-hidden="true">★★★★★</div>
      <div className="nl-rate-txt">
        <b>{t('rcTitle')}</b>
        <small>{t('rcSub')}</small>
      </div>
      <div className="nl-rate-btns">
        <button type="button" className="nl-rate-go" onClick={rate}>{t('rcRate')}</button>
        <button type="button" className="nl-rate-later" onClick={later}>{t('rcLater')}</button>
      </div>
    </section>
  )
}
