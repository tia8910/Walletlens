import { useLanguage } from '../LanguageContext'

/**
 * The "buy me a coffee" button: the filled amber disc, in the header beside
 * the settings gear.
 *
 * The disc is the design. Stripped back to a line icon it reads as one more
 * piece of navigation, which is exactly what it is not — it is the only thing
 * in that row that asks for something rather than doing something, and the
 * fill is what says so at a glance. Sized to .wl-topbar-x's 34px so it sits on
 * the same baseline as the controls beside it.
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
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 10h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-5Z" />
        <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
        <path d="M7.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
        <path d="M12.5 3.5c-.7.9-.7 1.8 0 2.7.7.9.7 1.8 0 2.7" />
      </svg>
    </a>
  )
}

export { SUPPORT_URL }
