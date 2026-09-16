import { useState } from 'react'
import { useLanguage } from '../LanguageContext'

/**
 * The "buy me a coffee" control: a header button beside the settings gear,
 * with a dismiss that takes it away for good.
 *
 * It began as a floating draggable circle and moved here because a support ask
 * should sit with the other chrome, not hover over the thing people came to
 * use. The header is a crowded 34px row, so this matches .wl-topbar-x exactly
 * and adds nothing but its own colour.
 *
 * THE DISMISS IS PERMANENT, ON PURPOSE.
 * An ask you cannot turn off is nagware. Once it is closed the component
 * renders nothing on every later visit, and nothing brings it back on its own
 * — no "are you sure", no reappearing after a week. That is the whole point of
 * offering the close.
 */

const SUPPORT_URL = 'https://buymeacoffee.com/Walletlens'
const HIDE_KEY = 'wl_coffee_hidden'

function isHidden() {
  // A throwing or empty localStorage (private window, blocked site data) means
  // "not dismissed", which shows the button. Failing the other way would hide
  // it from everyone whose browser is merely strict.
  try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
}

export default function CoffeeButton() {
  const { t } = useLanguage()
  const [hidden, setHidden] = useState(isHidden)

  if (hidden) return null

  function dismiss() {
    setHidden(true)
    try { localStorage.setItem(HIDE_KEY, '1') } catch {}
  }

  return (
    <span className="wl-coffee">
      <a
        className="wl-topbar-x wl-coffee-btn"
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        title={t('coffeeSupport')}
        aria-label={t('coffeeSupport')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
          <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
          <path d="M7.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
          <path d="M12.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
        </svg>
      </a>
      <button
        type="button"
        className="wl-coffee-x"
        onClick={dismiss}
        title={t('coffeeHide')}
        aria-label={t('coffeeHide')}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}

export { SUPPORT_URL, HIDE_KEY }
