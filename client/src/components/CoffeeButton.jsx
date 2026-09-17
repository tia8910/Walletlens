import { useLanguage } from '../LanguageContext'
import { track } from '../analytics'

/**
 * The "buy me a coffee" button: the filled amber disc, in the header beside
 * the settings gear.
 *
 * The click is tracked under its own name. initAutoTrack() already fires a
 * generic click for every <a>, but that lands in GA as one row among every
 * other link on the page, identified by a class name. A named event is the
 * one you can build a conversion on, and `source` leaves room for a second
 * placement later without the two becoming indistinguishable. The params
 * carry no portfolio data, per the contract at the top of analytics.js.
 *
 * The disc is the design. Stripped back to a line icon it reads as one more
 * piece of navigation, which is exactly what it is not — it is the only thing
 * in that row that asks for something rather than doing something, and the
 * fill is what says so at a glance. Sized to match the controls beside it.
 *
 * The steam moves. Two of the four paths carry their own class for that, so
 * the cup stays still and only the wisps drift, which is the difference
 * between a detail and a distraction. It stops under prefers-reduced-motion.
 *
 * IT IS AN <a>, AND THAT IS LOAD-BEARING.
 * Built briefly as a <button>, it picked up a global button padding of
 * 8.8px 17.6px, and with border-box on a 36px square that leaves a 0.8px
 * content box: the cup rendered at 0.8x0.8 and the control was a blank yellow
 * disc. Measured, not guessed. .wl-coffee-btn sets padding: 0 now so the shape
 * survives either element, but a link is also the right semantics — going to a
 * URL is the whole thing this does.
 */

const SUPPORT_URL = 'https://buymeacoffee.com/Walletlens'

export default function CoffeeButton() {
  const { t } = useLanguage()

  return (
    <a
      className="wl-coffee-btn"
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t('coffeeSupport')}
      aria-label={t('coffeeSupport')}
      onClick={() => track('coffee_support_click', { source: 'topbar' })}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
        <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
        <path className="wl-coffee-steam" d="M7.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
        <path className="wl-coffee-steam wl-coffee-steam-b" d="M12.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
      </svg>
    </a>
  )
}

export { SUPPORT_URL }
