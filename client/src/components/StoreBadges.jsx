import { EXTENSION_URL, ChromeIcon } from './InstallExtension'
import { track } from '../analytics'

// Public Google Play listing for the Android app (TWA wrapper around the PWA).
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=live.walletlens.twa'

/**
 * Google Play "folded triangle" mark.
 *
 * Drawn from explicit geometry rather than copied path data so the four faces
 * always meet cleanly: the logo is triangle A(top-left) B(bottom-left)
 * C(right tip) with an interior fold at M, and the tip beyond x=17 is the
 * separate yellow wedge.
 *   A = 3.5,2   B = 3.5,22   M = 13,12   C = 21,12
 *   P1 = 17,9.71  (on A→C)   P2 = 17,14.29 (on B→C)
 */
export function PlayMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {/* left spine */}
      <path d="M3.5 2 L13 12 L3.5 22 Z" fill="#00a0ff" />
      {/* upper face */}
      <path d="M3.5 2 L17 9.71 L13 12 Z" fill="#00e676" />
      {/* lower face */}
      <path d="M3.5 22 L17 14.29 L13 12 Z" fill="#ff3a44" />
      {/* tip wedge */}
      <path d="M17 9.71 L21 12 L17 14.29 L13 12 Z" fill="#ffce00" />
    </svg>
  )
}

/**
 * The three places WalletLens now lives: Google Play, the Chrome Web Store,
 * and the web app itself. Rendered as store-badge style pills.
 *
 * Props:
 *   source     analytics label for where the row was clicked
 *   hidePlay   drop the Play badge (pointless inside the installed Android app)
 *   compact    smaller padding/type, for use in dense sections
 */
export default function StoreBadges({ source = 'unknown', hidePlay = false, compact = false }) {
  const cls = `lp-store-row${compact ? ' lp-store-row-compact' : ''}`
  return (
    <div className={cls}>
      {!hidePlay && (
        <a
          className="lp-store-badge"
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('store_badge_click', { store: 'google_play', source })}
        >
          <PlayMark size={compact ? 18 : 22} />
          <span className="lp-store-badge-text">
            <span className="lp-store-badge-sub">Get it on</span>
            <span className="lp-store-badge-main">Google Play</span>
          </span>
        </a>
      )}
      <a
        className="lp-store-badge"
        href={EXTENSION_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('store_badge_click', { store: 'chrome_web_store', source })}
      >
        <ChromeIcon size={compact ? 18 : 22} />
        <span className="lp-store-badge-text">
          <span className="lp-store-badge-sub">Available in the</span>
          <span className="lp-store-badge-main">Chrome Web Store</span>
        </span>
      </a>
    </div>
  )
}
