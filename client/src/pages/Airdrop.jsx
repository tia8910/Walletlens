import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import LenzLogo from '../components/LenzLogo'
import { loadData } from '../data/storage'

// $LENZ airdrop quest page. Reuses the premium .lz-* theme from /lenz and adds
// .aq-* quest UI. Progress is stored locally (no backend, consistent with the
// privacy-first app). In-app quests auto-verify from localStorage; social quests
// are self-attested and re-checked at snapshot time. Final eligibility is settled
// by a Merkle claim with a per-wallet cap (see /lenz and sui-token/TOKENOMICS.md).

// TODO: confirm the official X handle. Telegram/YouTube are the real channels.
const SOCIAL = {
  x: 'https://x.com/walletlens',
  telegram: 'https://t.me/walletlenss',
  youtube: 'https://youtube.com/@walletlens',
}
const STORE_KEY = 'lenz_airdrop_v1'
const SUI_ADDR_RE = /^0x[0-9a-fA-F]{64}$/

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function hasPortfolio() {
  try { return (loadData('transactions') || []).length > 0 } catch { return false }
}
function distinctAssets() {
  try {
    const txs = loadData('transactions') || []
    return new Set(txs.map(t => t.coin_id || t.coinId || t.symbol)).size
  } catch { return 0 }
}

const TIERS = [
  { name: 'Explorer', min: 0, mult: '1.0×' },
  { name: 'Believer', min: 150, mult: '1.25×' },
  { name: 'Champion', min: 300, mult: '1.5×' },
  { name: 'Legend', min: 450, mult: '2.0×' },
]

export default function Airdrop() {
  const [state, setState] = useState(load)
  const [address, setAddress] = useState(state.address || '')

  useEffect(() => { document.title = '$LENZ Airdrop — Earn the Native Token of walletlens.live' }, [])

  // Capture referral on first visit.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && SUI_ADDR_RE.test(ref) && !state.referredBy) {
      setState(s => ({ ...s, referredBy: ref }))
    }
  }, []) // eslint-disable-line

  // Persist.
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch {} }, [state])

  const addrValid = SUI_ADDR_RE.test(address)
  const portfolio = hasPortfolio()
  const assets = distinctAssets()

  // Quest definitions. `auto` quests verify from on-device data.
  const QUESTS = useMemo(() => [
    { id: 'portfolio', icon: '📊', pts: 100, type: 'app', title: 'Create your portfolio', desc: 'Add at least one holding in WalletLens.', auto: portfolio, cta: 'Open app', href: '/dashboard' },
    { id: 'track3', icon: '🧺', pts: 100, type: 'app', title: 'Track 3+ assets', desc: 'Hold three or more different assets.', auto: assets >= 3, cta: 'Add assets', href: '/dashboard' },
    { id: 'follow_x', icon: '𝕏', pts: 50, type: 'social', title: 'Follow @walletlens on X', desc: 'Follow the official account.', href: SOCIAL.x },
    { id: 'repost', icon: '🔁', pts: 75, type: 'social', title: 'Repost the launch post', desc: 'Share the $LENZ launch on X.', href: `https://x.com/intent/tweet?text=${encodeURIComponent('I’m claiming the $LENZ airdrop on @walletlens — the free, privacy-first net-worth tracker, native token on #Sui.')}&url=${encodeURIComponent('https://walletlens.live/airdrop')}` },
    { id: 'telegram', icon: '✈️', pts: 50, type: 'social', title: 'Join the Telegram', desc: 'Join the community channel.', href: SOCIAL.telegram },
    { id: 'youtube', icon: '▶️', pts: 50, type: 'social', title: 'Subscribe on YouTube', desc: 'Subscribe to @walletlens.', href: SOCIAL.youtube },
    { id: 'screenshot', icon: '📸', pts: 100, type: 'proof', title: 'Share a portfolio screenshot', desc: 'Post a screenshot of your WalletLens dashboard with #LENZ.' },
    { id: 'referral', icon: '🤝', pts: 50, type: 'referral', title: 'Refer a friend', desc: 'Share your referral link — earn bonus weight per join.' },
  ], [portfolio, assets])

  const done = state.quests || {}
  const isDone = q => q.auto || !!done[q.id]
  const toggle = (q, val) => setState(s => ({ ...s, quests: { ...(s.quests || {}), [q.id]: val } }))

  const totalPts = QUESTS.reduce((a, q) => a + q.pts, 0)
  const earnedPts = QUESTS.reduce((a, q) => a + (isDone(q) ? q.pts : 0), 0)
  const pct = Math.round((earnedPts / totalPts) * 100)
  const tier = [...TIERS].reverse().find(t => earnedPts >= t.min) || TIERS[0]

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://walletlens.live'
  const refLink = addrValid ? `${origin}/airdrop?ref=${address}` : ''
  const [copied, setCopied] = useState(false)
  const copyRef = () => { if (refLink) { navigator.clipboard?.writeText(refLink); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  const saveAddress = () => setState(s => ({ ...s, address: addrValid ? address : s.address }))
  const registered = addrValid && state.address === address

  // Circumference for the progress ring (r=52).
  const C = 2 * Math.PI * 52
  const dash = C * (pct / 100)

  return (
    <div className="lz-root">
      <div className="lz-bg" aria-hidden="true">
        <span className="lz-orb lz-orb-a" /><span className="lz-orb lz-orb-b" /><span className="lz-orb lz-orb-c" /><span className="lz-mesh" />
      </div>

      <header className="lz-nav">
        <Link to="/" className="lz-back"><span aria-hidden="true">←</span> WalletLens</Link>
        <nav className="lz-navlinks">
          <Link to="/lenz">$LENZ</Link>
          <a href="#quests">Quests</a>
          <a href="#how">How it works</a>
        </nav>
      </header>

      <section className="lz-hero">
        <div className="lz-coin-wrap">
          <span className="lz-coin-halo" aria-hidden="true" />
          <LenzLogo size={120} animated className="lz-coin" />
        </div>
        <span className="lz-eyebrow">Airdrop · 10,500,000 LENZ pool</span>
        <h1 className="lz-title">$LENZ Airdrop</h1>
        <p className="lz-tagline">Earn $LENZ — the native token of WalletLens — by using the app and joining the community. Complete quests, climb tiers, and claim at snapshot. No purchase required.</p>

        <div className="aq-dash">
          <div className="aq-ring" role="img" aria-label={`${pct}% of quests complete`}>
            <svg width="124" height="124" viewBox="0 0 124 124">
              <circle cx="62" cy="62" r="52" className="aq-ring-bg" />
              <circle cx="62" cy="62" r="52" className="aq-ring-fg" strokeDasharray={`${dash} ${C}`} transform="rotate(-90 62 62)" />
            </svg>
            <div className="aq-ring-mid"><b>{pct}%</b><span>complete</span></div>
          </div>
          <div className="aq-dash-stats">
            <div className="aq-dash-stat"><span>Points</span><b>{earnedPts}<small> / {totalPts}</small></b></div>
            <div className="aq-dash-stat"><span>Tier</span><b className="aq-tier-name">{tier.name}</b><small>{tier.mult} weight</small></div>
            <div className="aq-dash-stat"><span>Status</span><b>{registered ? 'Registered' : 'Not registered'}</b></div>
          </div>
        </div>
      </section>

      <main className="lz-main">
        {/* Sui address gate */}
        <section className="lz-card lz-section">
          <h2 className="lz-h2">1 · Add your Sui address</h2>
          <p>Your $LENZ will be claimable to this Sui address. Double-check it — it cannot be recovered if wrong.</p>
          <div className="aq-addr">
            <input
              className="aq-input"
              placeholder="0x… (66-character Sui address)"
              value={address}
              spellCheck={false}
              onChange={e => setAddress(e.target.value.trim())}
            />
            <button className="lz-btn lz-btn-primary" disabled={!addrValid} onClick={saveAddress}>
              {registered ? 'Saved ✓' : 'Save'}
            </button>
          </div>
          {address && !addrValid && <p className="aq-err">That doesn't look like a Sui address (expected 0x + 64 hex characters).</p>}
          {state.referredBy && <p className="lz-note">Referred by <code>{state.referredBy.slice(0, 10)}…</code> — thanks for joining through a friend.</p>}
        </section>

        {/* Quests */}
        <section id="quests" className="lz-card lz-section">
          <h2 className="lz-h2">2 · Complete quests</h2>
          <p>In-app quests verify automatically on this device. Social quests open the link, then mark them done — they're re-checked at snapshot.</p>
          <div className="aq-quests">
            {QUESTS.map(q => {
              const complete = isDone(q)
              return (
                <div key={q.id} className={`aq-quest${complete ? ' is-done' : ''}`}>
                  <span className="aq-q-icon" aria-hidden="true">{q.icon}</span>
                  <div className="aq-q-body">
                    <div className="aq-q-head">
                      <strong>{q.title}</strong>
                      <span className="aq-q-pts">+{q.pts}</span>
                    </div>
                    <p>{q.desc}</p>

                    {q.type === 'referral' ? (
                      <div className="aq-ref">
                        <input className="aq-input aq-ref-input" readOnly value={refLink || 'Add your Sui address to get a referral link'} />
                        <button className="lz-btn lz-btn-ghost" disabled={!refLink} onClick={copyRef}>{copied ? 'Copied!' : 'Copy link'}</button>
                      </div>
                    ) : q.type === 'proof' ? (
                      <div className="aq-q-actions">
                        <a className="lz-btn lz-btn-ghost" href={`https://x.com/intent/tweet?text=${encodeURIComponent('My @walletlens portfolio, tracked privately & for free. Claiming the $LENZ airdrop on #Sui #LENZ')}&url=${encodeURIComponent('https://walletlens.live/airdrop')}`} target="_blank" rel="noreferrer">Share on X</a>
                        <button className="aq-mark" onClick={() => toggle(q, !complete)}>{complete ? 'Marked ✓' : 'Mark done'}</button>
                      </div>
                    ) : q.type === 'app' ? (
                      complete
                        ? <span className="aq-auto">Verified on this device ✓</span>
                        : <Link className="lz-btn lz-btn-ghost" to={q.href}>{q.cta}</Link>
                    ) : (
                      <div className="aq-q-actions">
                        <a className="lz-btn lz-btn-ghost" href={q.href} target="_blank" rel="noreferrer" onClick={() => toggle(q, true)}>{q.cta || 'Open'}</a>
                        <button className="aq-mark" onClick={() => toggle(q, !complete)}>{complete ? 'Marked ✓' : 'Mark done'}</button>
                      </div>
                    )}
                  </div>
                  <span className="aq-q-check" aria-hidden="true">{complete ? '✓' : ''}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Tiers */}
        <section className="lz-card lz-section">
          <h2 className="lz-h2">Tiers &amp; weight</h2>
          <p>More points = a higher allocation weight (capped per wallet to keep it fair).</p>
          <div className="aq-tiers">
            {TIERS.map(t => (
              <div key={t.name} className={`aq-tier${tier.name === t.name ? ' is-active' : ''}`}>
                <b>{t.name}</b>
                <span>{t.min}+ pts</span>
                <small>{t.mult}</small>
              </div>
            ))}
          </div>
        </section>

        {/* How it works / honesty */}
        <section id="how" className="lz-card lz-section">
          <h2 className="lz-h2">How eligibility works</h2>
          <ul className="lz-checks">
            <li>The airdrop pool is <strong>10,500,000 LENZ (50% of supply)</strong> — users-first, never an insider bag.</li>
            <li>At snapshot, eligible wallets and amounts are published as a <strong>Merkle claim</strong> — you claim your own $LENZ, paying your own gas.</li>
            <li>A <strong>per-wallet cap</strong> (~0.1% of supply) keeps any single address from dominating — no whales.</li>
            <li>Social quests are <strong>re-checked at snapshot</strong>; obvious sybil/bot wallets are filtered out.</li>
            <li>Progress on this page is stored <strong>on your device</strong> — WalletLens keeps no account or server-side profile of you.</li>
          </ul>
          <div className="lz-warn">
            <strong>Beware of scams.</strong> The only official airdrop is on <strong>walletlens.live/airdrop</strong>. WalletLens will never DM you a "claim" link, never ask you to connect a wallet to a random site, and never ask for your seed phrase.
          </div>
        </section>

        <p className="lz-disclaimer">This page is informational only and is <strong>not financial advice</strong> and <strong>not an offer to sell a security</strong>. Quest list, points, weights, dates and amounts are draft and may change. Completing quests does not guarantee an allocation. Do your own research.</p>
      </main>

      <footer className="lz-foot">
        <div className="lz-foot-brand"><LenzLogo size={26} /> <span>$LENZ Airdrop</span></div>
        <nav className="lz-foot-links">
          <Link to="/lenz">About $LENZ</Link>
          <Link to="/">WalletLens</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}
