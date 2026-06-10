import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import LenzLogo from '../components/LenzLogo'

// "Use & Earn $LENZ" page. PRE-LAUNCH: earning is "Coming soon" — only the waitlist
// (paste a Sui address, no wallet connection) is live. Points → $LENZ at launch.
// See REWARDS.md for the full spec. Reuses the premium .lz-* / .aq-* theme.

const STORE_KEY = 'lenz_airdrop_v1'
const SUI_ADDR_RE = /^0x[0-9a-fA-F]{64}$/
// Set to the deployed airdrop-api URL to enable server-side waitlist. Empty =
// local-only. Earning stays "Coming soon" until launch regardless.
const AIRDROP_API = 'https://walletlens.tia8910.deno.net'

const INAPP = [
  { icon: '🔥', title: 'Daily streak', desc: 'Use WalletLens daily — streak bonuses.', pts: '10/day' },
  { icon: '📊', title: 'Create your portfolio', desc: 'Add your first holding.', pts: 100 },
  { icon: '🧺', title: 'Track 3+ assets', desc: 'Diversify across assets.', pts: 100 },
  { icon: '🎓', title: 'Academy lessons', desc: 'Learn investing & crypto, lesson by lesson.', pts: '50 ea' },
  { icon: '🏅', title: 'Finish the Academy', desc: 'Complete every lesson.', pts: 200 },
  { icon: '🤖', title: 'Use a feature', desc: 'AI analysis, alerts, import…', pts: '50 ea' },
  { icon: '📱', title: 'Install the app (PWA)', desc: 'Add WalletLens to your home screen.', pts: 50 },
]
const SHARING = [
  { icon: '🤝', title: 'Refer an active friend', desc: 'They join and actually use it.', pts: 200 },
  { icon: '🧵', title: 'Write a thread', desc: 'A quality thread about WalletLens/$LENZ (reviewed).', pts: 500 },
  { icon: '📣', title: 'Mention @wallet_lens', desc: 'Tag us in a post.', pts: '25/day' },
  { icon: '📰', title: 'Share an article', desc: 'Share a WalletLens blog post.', pts: 30 },
  { icon: '🖼️', title: 'Share your portfolio card', desc: 'Post your net-worth card.', pts: 50 },
  { icon: '𝕏', title: 'Follow + repost', desc: 'Follow @wallet_lens and repost.', pts: 50 },
]

const FAQS = [
  { q: 'Is earning live yet?', a: 'Not yet — WalletLens is pre-launch (on Sui testnet). Every earn action is marked "Coming soon." You can join the waitlist now by adding your Sui address, and you\'ll be first when earning goes live.' },
  { q: 'How do I earn $LENZ?', a: 'When it launches: use the app and share it to earn Points. At mainnet launch, Points convert to $LENZ (pro-rata, capped per wallet) and you claim them on-chain. No purchase, ever.' },
  { q: 'Do I need to connect a wallet?', a: 'No. You only paste your Sui address to join the waitlist — no wallet connection, no signature. You use your wallet once, at the very end, to claim. We never ask you to connect a wallet or share your seed phrase to register.' },
  { q: 'What data do you store?', a: 'Your portfolio never leaves your device. The optional rewards program records only your Sui address and the points you earn — never your holdings, never your identity — and only if you choose to participate.' },
  { q: 'How is farming prevented?', a: 'Points convert from a fixed budget split pro-rata with a per-wallet cap, plus an on-chain wallet gate at conversion and review-gated threads — so spamming earns little.' },
]

export default function Airdrop() {
  const [state, setState] = useState(() => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} } })
  const [address, setAddress] = useState(state.address || '')
  const [regMsg, setRegMsg] = useState('')
  const [registering, setRegistering] = useState(false)

  useEffect(() => { document.title = 'Earn $LENZ — Use WalletLens, get rewarded (coming soon)' }, [])
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref && SUI_ADDR_RE.test(ref) && !state.referredBy) setState(s => ({ ...s, referredBy: ref }))
  }, []) // eslint-disable-line
  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)) } catch {} }, [state])

  const addrValid = SUI_ADDR_RE.test(address)
  const joined = addrValid && state.address === address
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://walletlens.live'
  const refLink = addrValid ? `${origin}/airdrop?ref=${address}` : ''
  const [copied, setCopied] = useState(false)
  const copyRef = () => { if (refLink) { navigator.clipboard?.writeText(refLink); setCopied(true); setTimeout(() => setCopied(false), 1500) } }

  const join = async () => {
    if (!addrValid) return
    setState(s => ({ ...s, address }))
    if (!AIRDROP_API) { setRegMsg('You\'re on the waitlist (saved on this device). We\'ll notify you at launch.'); return }
    setRegistering(true); setRegMsg('')
    try {
      const r = await fetch(`${AIRDROP_API}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, quests: [], referredBy: state.referredBy || undefined }),
      })
      const j = await r.json()
      setRegMsg(r.ok ? (j.note || 'You\'re on the waitlist ✓') : (j.error || 'Could not join — try again.'))
    } catch { setRegMsg('Could not reach the server — saved locally.') }
    finally { setRegistering(false) }
  }

  const Card = ({ a }) => (
    <div className="aq-quest">
      <span className="aq-q-icon" aria-hidden="true">{a.icon}</span>
      <div className="aq-q-body">
        <div className="aq-q-head"><strong>{a.title}</strong><span className="aq-q-pts">+{a.pts}</span></div>
        <p>{a.desc}</p>
        <span className="lz-soon">Coming soon</span>
      </div>
    </div>
  )

  return (
    <div className="lz-root">
      <div className="lz-bg" aria-hidden="true">
        <span className="lz-orb lz-orb-a" /><span className="lz-orb lz-orb-b" /><span className="lz-orb lz-orb-c" /><span className="lz-mesh" />
      </div>

      <header className="lz-nav">
        <Link to="/" className="lz-back"><span aria-hidden="true">←</span> WalletLens</Link>
        <nav className="lz-navlinks">
          <Link to="/lenz">$LENZ</Link>
          <a href="#earn">Earn</a>
          <a href="#how">How it works</a>
        </nav>
      </header>

      <section className="lz-hero">
        <div className="lz-coin-wrap">
          <span className="lz-coin-halo" aria-hidden="true" />
          <LenzLogo size={120} animated className="lz-coin" />
        </div>
        <span className="lz-eyebrow">Use &amp; Earn · Coming soon</span>
        <h1 className="lz-title">Earn $LENZ</h1>
        <p className="lz-tagline">The net-worth tracker that rewards you for using it. Use WalletLens and share it to earn points — converted to <strong>$LENZ</strong> at launch. Free forever. No purchase.</p>
        <div className="lz-badges">
          <span className="lz-badge">🎁 Free to earn</span>
          <span className="lz-badge">🚫 No sale · No IPO</span>
          <span className="lz-badge">⚖️ Fair · capped per wallet</span>
          <span className="lz-badge">🔒 No wallet connect to join</span>
        </div>
        <div className="lz-cta">
          <a href="#waitlist" className="lz-btn lz-btn-primary">Join the waitlist</a>
          <a href="#how" className="lz-btn lz-btn-ghost">How it works</a>
        </div>
      </section>

      <main className="lz-main">
        {/* Waitlist (LIVE) */}
        <section id="waitlist" className="lz-card lz-section">
          <h2 className="lz-h2">Join the waitlist</h2>
          <p>Earning isn't live yet — but add your Sui address now to be first when it opens. <strong>No wallet connection, no signature.</strong> You'll only use your wallet at the very end to claim.</p>
          <div className="aq-addr">
            <input className="aq-input" placeholder="0x… (66-character Sui address)" value={address} spellCheck={false} onChange={e => setAddress(e.target.value.trim())} />
            <button className="lz-btn lz-btn-primary" disabled={!addrValid || registering} onClick={join}>
              {registering ? 'Joining…' : joined ? 'On the list ✓' : 'Join waitlist'}
            </button>
          </div>
          {address && !addrValid && <p className="aq-err">That doesn't look like a Sui address (0x + 64 hex).</p>}
          {regMsg && <p className="lz-note">{regMsg}</p>}
          {joined && (
            <div className="aq-ref">
              <input className="aq-input aq-ref-input" readOnly value={refLink} />
              <button className="lz-btn lz-btn-ghost" onClick={copyRef}>{copied ? 'Copied!' : 'Copy referral link'}</button>
            </div>
          )}
          <p className="lz-note">🔒 We never ask you to connect a wallet, sign a transaction, or share your seed phrase to join. Anyone who does is a scam.</p>
        </section>

        {/* Earn actions (COMING SOON) */}
        <section id="earn" className="lz-section">
          <h2 className="lz-h2 lz-center">Ways to earn <span className="lz-sub">(coming soon)</span></h2>
          <div className="lz-card lz-section">
            <h3 className="lz-h3">📲 Use the app</h3>
            <div className="aq-quests">{INAPP.map(a => <Card key={a.title} a={a} />)}</div>
          </div>
          <div className="lz-card lz-section">
            <h3 className="lz-h3">🔁 Share &amp; grow the community</h3>
            <div className="aq-quests">{SHARING.map(a => <Card key={a.title} a={a} />)}</div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="lz-card lz-section">
          <h2 className="lz-h2">How it works</h2>
          <ul className="lz-checks">
            <li><strong>Now:</strong> join the waitlist (just your Sui address).</li>
            <li><strong>At launch:</strong> earning opens — use the app + share to collect points.</li>
            <li><strong>Points → $LENZ:</strong> points convert to $LENZ from a fixed budget, pro-rata, capped per wallet — claimed on-chain (claim-once).</li>
            <li><strong>Fair &amp; private:</strong> no sale, no insider bag; we store only your address + points, never your holdings.</li>
            <li><strong>After launch:</strong> hold/lock $LENZ to unlock perks (ad-free, pro features) — <em>coming soon</em>.</li>
          </ul>
          <div className="lz-warn"><strong>Beware of scams.</strong> The only official page is walletlens.live/airdrop. We never DM you a claim link or ask you to connect a wallet to join.</div>
        </section>

        {/* FAQ */}
        <section className="lz-section">
          <h2 className="lz-h2 lz-center">FAQ</h2>
          <div className="lz-faq">
            {FAQS.map(f => (
              <details key={f.q} className="lz-faq-item"><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
        </section>

        <p className="lz-disclaimer">Informational only — <strong>not financial advice</strong> and <strong>not an offer to sell a security</strong>. Earning is not live yet; actions, points and dates are draft and may change. Participation does not guarantee an allocation. Do your own research.</p>
      </main>

      <footer className="lz-foot">
        <div className="lz-foot-brand"><LenzLogo size={26} /> <span>Earn $LENZ</span></div>
        <nav className="lz-foot-links">
          <Link to="/lenz">About $LENZ</Link>
          <Link to="/">WalletLens</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}
