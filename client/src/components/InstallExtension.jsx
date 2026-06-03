import { useMemo } from 'react'
import { track } from '../analytics'

// Public Chrome Web Store listing (works in Chrome, Edge, Brave, Opera, Arc —
// all Chromium browsers can install from the Chrome Web Store).
export const EXTENSION_URL =
  'https://chromewebstore.google.com/detail/walletlens-portfolio/ajmjdeobjjmabgonhaeaaehoepfafhbn'

// Detect the browser so the label matches what the user sees ("Add to Chrome"
// vs "Add to Edge"). Returns { canInstall, label, store }.
function detectBrowser() {
  if (typeof navigator === 'undefined') return { canInstall: true, label: 'Chrome', store: 'Chrome Web Store' }
  const ua = navigator.userAgent
  const isEdge   = /Edg\//.test(ua)
  const isOpera  = /OPR\//.test(ua)
  const isBrave  = !!(navigator.brave)
  const isChrome = /Chrome\//.test(ua) && !isEdge && !isOpera
  const isFirefox = /Firefox\//.test(ua)
  const isSafari = /Safari\//.test(ua) && !/Chrome\//.test(ua)
  // Only Chromium-based browsers can install from the Chrome Web Store.
  const canInstall = !isFirefox && !isSafari
  let label = 'Chrome'
  if (isEdge) label = 'Edge'
  else if (isBrave) label = 'Brave'
  else if (isOpera) label = 'Opera'
  return { canInstall, label, store: 'Chrome Web Store', isChrome }
}

const ChromeIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="11" fill="#fff" />
    <path fill="#4caf50" d="M24 13h17.6A23.9 23.9 0 0 0 24 0 24 24 0 0 0 3.4 11.8L12 26.7A12 12 0 0 1 24 13z" />
    <path fill="#ffc107" d="M41.6 13H24a12 12 0 0 1 10.4 18l-8.6 14.9A24 24 0 0 0 41.6 13z" />
    <path fill="#f44336" d="M12 26.7 3.4 11.8A24 24 0 0 0 25.8 47.9L34.4 33A12 12 0 0 1 12 26.7z" />
    <circle cx="24" cy="24" r="6" fill="#2196f3" />
  </svg>
)

/**
 * Reusable "Install the browser extension" call-to-action.
 *
 * Props:
 *   variant: 'button' (default) | 'badge' | 'link' | 'banner'
 *   source:  analytics label for where it was clicked
 *   style:   extra inline styles merged onto the root
 */
export default function InstallExtension({ variant = 'button', source = 'unknown', style = {} }) {
  const { canInstall, label, store } = useMemo(detectBrowser, [])

  const onClick = () => track('extension_install_click', { source, browser: label, can_install: canInstall })

  const text = canInstall ? `Add to ${label}` : 'Get the browser extension'

  const common = {
    href: EXTENSION_URL,
    target: '_blank',
    rel: 'noopener noreferrer',
    onClick,
  }

  if (variant === 'link') {
    return (
      <a {...common} style={{ color: '#4ade80', fontWeight: 600, textDecoration: 'none', ...style }}>
        {text}
      </a>
    )
  }

  if (variant === 'badge') {
    return (
      <a {...common} style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        background: '#0b1f12', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '10px',
        padding: '0.5rem 0.9rem', textDecoration: 'none', color: '#e2f5ea', fontWeight: 600,
        fontSize: '0.85rem', ...style,
      }}>
        <ChromeIcon /> <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>Available in the</span> {store}
      </a>
    )
  }

  if (variant === 'banner') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        flexWrap: 'wrap', background: 'linear-gradient(135deg, rgba(74,222,128,0.08), rgba(34,197,94,0.04))',
        border: '1px solid rgba(74,222,128,0.22)', borderRadius: '14px', padding: '0.9rem 1.1rem', ...style,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <ChromeIcon size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: '#e2f5ea', fontSize: '0.92rem' }}>Get the WalletLens extension</div>
            <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.78rem' }}>
              See your portfolio from the toolbar — no need to open the site.
            </div>
          </div>
        </div>
        <a {...common} style={{
          flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
          background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#04210f', fontWeight: 800,
          fontSize: '0.85rem', padding: '0.55rem 1rem', borderRadius: '10px', textDecoration: 'none',
          boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
        }}>
          <ChromeIcon /> {text}
        </a>
      </div>
    )
  }

  // Default: solid button
  return (
    <a {...common} style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
      background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#04210f', fontWeight: 800,
      fontSize: '0.9rem', padding: '0.6rem 1.1rem', borderRadius: '12px', textDecoration: 'none',
      boxShadow: '0 4px 14px rgba(34,197,94,0.3)', ...style,
    }}>
      <ChromeIcon /> {text}
    </a>
  )
}
