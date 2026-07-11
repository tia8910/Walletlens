import { useEffect } from 'react'
import Icon from './Icon'
import { track } from '../analytics'

/**
 * HelpGuide — the on-demand "How it works" guide the Help (?) button opens.
 * Answers the two questions new users ask: what is each area, and where does it
 * live. Card-based and scannable (no fragile DOM spotlights), so it works from
 * any screen and can be reopened any time. Each area has a "Go" shortcut that
 * navigates there and closes the guide.
 */

const SECTIONS = [
  {
    icon: 'home', title: 'Dashboard', path: '/dashboard',
    desc: 'Your home base. Total net worth, every holding, AI analysis, risk scores and alerts — all in one glance.',
  },
  {
    icon: 'trend-up', title: 'Trades', path: '/transactions',
    desc: 'Log your buys & sells. WalletLens auto-tracks profit/loss, average cost and overall performance for you.',
  },
  {
    icon: 'sparkles', title: 'Tools & AI Analysis', path: '/dashboard',
    desc: 'Risk Scanner flags scams & rug-pulls, the AI Advisor grades your portfolio A–F, and the Sell-Plan builder maps how to hit your target.',
  },
  {
    icon: 'zap', title: 'Alpha', path: '/alpha',
    desc: 'AI Alpha score, hidden gems and smart-money signals — tuned to the coins you actually hold.',
  },
  {
    icon: 'whale', title: 'Whales', path: '/whales',
    desc: 'Follow the biggest wallets. See what smart money is buying before the crowd reacts.',
  },
  {
    icon: 'graduation', title: 'Coach & Academy', path: '/coach',
    desc: 'Personalised guidance plus bite-size lessons to sharpen your investing IQ.',
  },
]

const TIPS = [
  { icon: 'plus', text: 'Add holdings fast: use the + button, or import by screenshot or voice — no manual typing needed.' },
  { icon: 'search', text: 'Tap the ⓘ icon next to any metric to see what it means and how to read it.' },
  { icon: 'lock', text: 'Everything stays on your device. No account, no server — your data never leaves your phone.' },
]

export default function HelpGuide({ open, onClose, onNavigate }) {
  useEffect(() => {
    if (open) track('help_guide_open')
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const go = (path) => { onClose(); if (path) onNavigate?.(path) }

  return (
    <div className="wl-help-overlay" onClick={onClose}>
      <div className="wl-help-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="How WalletLens works">
        <div className="wl-help-head">
          <div>
            <h2 className="wl-help-title">How WalletLens works</h2>
            <p className="wl-help-sub">What each area is — and where to find it.</p>
          </div>
          <button className="wl-help-x" onClick={onClose} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="wl-help-body">
          <button
            className="wl-help-primary"
            onClick={() => { onClose(); window.dispatchEvent(new Event('wl:add-asset-guide')) }}
          >
            <span className="wl-help-primary-ico" aria-hidden="true"><Icon name="plus" size={16} /></span>
            <span className="wl-help-primary-txt">
              <strong>How to add your assets</strong>
              <span>A quick step-by-step walkthrough</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>

          {SECTIONS.map(s => (
            <div key={s.title} className="wl-help-card">
              <span className="wl-help-ico" aria-hidden="true"><Icon name={s.icon} size={18} /></span>
              <div className="wl-help-card-main">
                <div className="wl-help-card-top">
                  <strong>{s.title}</strong>
                  <button className="wl-help-go" onClick={() => go(s.path)}>
                    Go
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}

          <div className="wl-help-tips">
            <h3 className="wl-help-tips-title">Get the most out of it</h3>
            {TIPS.map((tip, i) => (
              <div key={i} className="wl-help-tip-row">
                <span aria-hidden="true"><Icon name={tip.icon} size={16} /></span>
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="wl-help-foot">
          <button className="wl-help-done" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  )
}
