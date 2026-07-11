import { useEffect } from 'react'
import Icon from '../components/Icon'
import { Link } from 'react-router-dom'
import LenzLogo from '../components/LenzLogo'

// $LENZ — native token of walletlens.live. A self-contained, premium, dark
// landing experience with its own identity (see LenzLogo). Scoped under .lz-*
// so it never affects the rest of the site. Numbers mirror sui-token/TOKENOMICS.md.

const ALLOCATIONS = [
  { label: 'Community rewards (use & earn)', pct: 50, lenz: 5_000_000, note: 'Earned by using and sharing the app — released over time, not dumped at once' },
  { label: 'Liquidity', pct: 35, lenz: 3_500_000, note: 'DEX liquidity so a real price exists (LP locked)' },
  { label: 'Ecosystem / DAO treasury', pct: 15, lenz: 1_500_000, note: 'Transparent, time-locked — growth, listings, holder programs. No insider bag.' },
]

const STATS = [
  { k: 'Max supply', v: '10,000,000', s: 'fixed — minting frozen forever' },
  { k: 'Distribution', v: 'Earn-based', s: 'use & share the app to earn' },
  { k: 'Chain', v: 'Sui', s: 'fast, low-fee — free CG/CMC listing' },
  { k: 'Insiders', v: '0%', s: 'no team or VC allocation' },
]

const UTILITY = [
  { t: 'Use & earn', d: 'Earn $LENZ by using WalletLens and sharing it — no purchase required.' },
  { t: 'Ad-free + pro (holders)', d: 'Hold or lock $LENZ to unlock an ad-free app and pro features — rolling out after launch.' },
  { t: 'Governance', d: 'Vote on the roadmap, supported assets and treasury spend.' },
  { t: 'Free core, always', d: 'The free tracker never changes; $LENZ only adds extras on top.' },
]

const CHECKS = [
  'Fixed supply — 10,000,000 LENZ, with minting frozen forever (no inflation, ever)',
  'No insider bag — 0% to team or VCs; reward & reserve tokens are time-locked and released on a public schedule',
  'Immutable metadata — name, symbol, decimals and icon are frozen',
  'No admin backdoor, no upgrade hook — a small, standard Sui coin',
  'Liquidity locked so it cannot be pulled',
  'Open-source and on-chain verifiable (the repo ships a verify-onchain.sh PASS/FAIL check)',
]

const FAQS = [
  { q: 'What is $LENZ?', a: '$LENZ is the native token of walletlens.live — a free, no-account, privacy-first all-asset portfolio tracker on Sui. It is a standard Sui coin with a fixed 10,000,000 supply and minting frozen forever. You earn $LENZ by using and sharing the app, and holders unlock premium features. The free core tracker never requires it.' },
  { q: 'How do I earn $LENZ?', a: 'By using WalletLens and helping it grow — tracking your portfolio, daily streaks, completing Academy lessons, referring active users, and sharing content. Earning opens at launch (you can join the waitlist now). You collect points that convert to $LENZ — no purchase, ever.' },
  { q: 'Why Sui?', a: 'Sui is fast, low-fee and has a large, growing ecosystem, so $LENZ is easy to buy (Cetus, Turbos, FlowX, DeepBook and aggregators) and easy to discover — listing on CoinGecko and CoinMarketCap is free, with no costly gatekeepers.' },
  { q: 'Does holding $LENZ change the app?', a: 'The free tracker is always 100% free and never requires $LENZ. Holding or locking $LENZ unlocks optional extras — an ad-free app, pro analytics and governance — rolling out after launch. It only adds on top; it never gates the core features.' },
  { q: 'Is $LENZ private?', a: 'No, and we will not pretend otherwise. Sui is a public chain, so balances and transfers are visible on a block explorer. The privacy is in the product: WalletLens keeps all your portfolio data on your device. $LENZ is the native/utility token of that privacy-first app, not a "privacy coin."' },
  { q: 'What is the supply, and are there unlocks?', a: 'A fixed 10,000,000 LENZ, minted once with minting frozen forever — no inflation. There is no team or insider allocation. Reward and reserve tokens are released transparently over time from a public, time-locked schedule rather than all at once, which protects holders from sudden sell pressure. Everything is verifiable on-chain.' },
  { q: 'Where can I get or trade $LENZ?', a: 'At launch, on Sui DEXes (Cetus, Turbos, FlowX) and aggregators; it also auto-appears on DexScreener and DexTools, and we will apply to CoinGecko and CoinMarketCap (both free). Before launch, you earn it by using the app — join the waitlist on the Earn page.' },
  { q: 'How do I know $LENZ is not a scam?', a: 'Verify instead of trusting: fixed 10,000,000 supply, minting frozen, immutable metadata, 0% insider allocation, reserves time-locked on a public schedule, and locked liquidity — all verifiable on-chain (the repo ships a verify-onchain.sh that prints a PASS/FAIL report). The only official package id and coin type are published on this page and in the open-source repo.' },
  { q: 'Is this financial advice or an investment offer?', a: 'No. This page is informational only. $LENZ is not financial advice and nothing here is an offer to sell a security. Do your own research.' },
]

export default function Lenz() {
  useEffect(() => {
    document.title = '$LENZ — Native Token of walletlens.live (on Sui)'
  }, [])

  return (
    <div className="lz-root">
      <div className="lz-bg" aria-hidden="true">
        <span className="lz-orb lz-orb-a" />
        <span className="lz-orb lz-orb-b" />
        <span className="lz-orb lz-orb-c" />
        <span className="lz-mesh" />
      </div>

      <header className="lz-nav">
        <Link to="/" className="lz-back"><span aria-hidden="true">←</span> WalletLens</Link>
        <nav className="lz-navlinks">
          <a href="#tokenomics">Tokenomics</a>
          <a href="#hold">Hold</a>
          <a href="#verify">Verify</a>
        </nav>
      </header>

      <section className="lz-hero">
        <div className="lz-coin-wrap">
          <span className="lz-coin-halo" aria-hidden="true" />
          <LenzLogo size={148} animated className="lz-coin" />
        </div>
        <span className="lz-eyebrow">Native token of walletlens.live</span>
        <h1 className="lz-title">$LENZ</h1>
        <p className="lz-tagline">The native token of WalletLens — a fixed <strong>10M</strong>-supply coin on <strong>Sui</strong>. <strong>Earn it by using the app.</strong> No sale. No insider bag. Mint frozen. Verifiable.</p>
        <div className="lz-badges">
          <span className="lz-badge"><Icon name="gift" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Earn by using</span>
          <span className="lz-badge"><Icon name="x" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />No sale · No IPO</span>
          <span className="lz-badge"><Icon name="scale" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />0% insiders</span>
          <span className="lz-badge"><Icon name="lock" size={13} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Mint frozen</span>
        </div>
        <div className="lz-chips">
          <span className="lz-chip"><b>10M</b> fixed supply</span>
          <span className="lz-chip"><b>0%</b> insiders</span>
          <span className="lz-chip">Built on Sui</span>
          <span className="lz-chip">Use &amp; earn</span>
        </div>
        <div className="lz-cta">
          <Link to="/airdrop/" className="lz-btn lz-btn-primary">Earn $LENZ</Link>
          <a href="#verify" className="lz-btn lz-btn-ghost">Verify on-chain</a>
          <a href="#hold" className="lz-btn lz-btn-ghost">How to hold</a>
        </div>
      </section>

      <main className="lz-main">
        <div className="lz-cards2">
          <section className="lz-card">
            <h2 className="lz-h2">What is $LENZ?</h2>
            <p>$LENZ is the native token of <a href="https://walletlens.live" target="_blank" rel="noreferrer">walletlens.live</a> — a 100% free, no-account, privacy-first all-asset portfolio tracker for crypto, stocks, precious metals, fiat and real estate, with AI insights and live prices, where all your data stays on your device.</p>
            <p>It is a <strong>standard Sui coin</strong> with a fixed 10,000,000 supply and minting frozen forever. You <strong>earn it by using and sharing the app</strong>, and holders unlock premium features — the utility &amp; governance token of the WalletLens ecosystem.</p>
          </section>
          <section className="lz-card">
            <h2 className="lz-h2">Why Sui</h2>
            <p>Sui is fast and low-fee with a large, growing ecosystem — so $LENZ is <strong>easy to buy</strong> (Cetus, Turbos, BlueMove, DeepBook and aggregators) and <strong>easy to list</strong> (CoinGecko / CoinMarketCap applications are free).</p>
            <p>Sui is a public chain, so $LENZ is the native/utility token of a privacy-first app — <strong>not a "privacy coin."</strong> The privacy is in the product: your portfolio data stays on your device.</p>
          </section>
        </div>

        <section id="tokenomics" className="lz-card lz-section">
          <h2 className="lz-h2">Tokenomics — fixed supply, fair</h2>
          <div className="lz-stats">
            {STATS.map(s => (
              <div key={s.k} className="lz-stat">
                <span className="lz-stat-k">{s.k}</span>
                <span className="lz-stat-v">{s.v}</span>
                <span className="lz-stat-s">{s.s}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lz-card lz-section">
          <h2 className="lz-h2">Distribution — community-first, no insider bag</h2>
          <div className="lz-bars">
            {ALLOCATIONS.map(a => (
              <div key={a.label} className="lz-bar-row">
                <div className="lz-bar-top">
                  <span className="lz-bar-label">{a.label}</span>
                  <span className="lz-bar-num">{a.pct}% · {a.lenz.toLocaleString()} LENZ</span>
                </div>
                <div className="lz-bar-track">
                  <span className="lz-bar-fill" style={{ width: `${a.pct}%` }} />
                </div>
                <span className="lz-bar-note">{a.note}</span>
              </div>
            ))}
          </div>
          <p className="lz-note">There is <strong>no team or insider allocation</strong> (0%). Reward and reserve tokens are released transparently over time from a public, time-locked schedule — not dumped at once — which protects holders from sudden sell pressure. The treasury is transparent and governance-controlled, and the liquidity LP is locked.</p>
        </section>

        <section className="lz-card lz-section">
          <h2 className="lz-h2">Utility</h2>
          <div className="lz-util">
            {UTILITY.map(u => (
              <div key={u.t} className="lz-util-item">
                <span className="lz-util-dot" aria-hidden="true" />
                <div>
                  <strong>{u.t}</strong>
                  <p>{u.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="hold" className="lz-card lz-section">
          <h2 className="lz-h2">How to buy &amp; hold $LENZ <span className="lz-sub">(wallet &amp; gas)</span></h2>
          <p>$LENZ lives on Sui, so you need a Sui wallet and a little SUI for gas.</p>
          <ol className="lz-steps">
            <li><strong>Install a wallet</strong> — <a href="https://slush.app" target="_blank" rel="noreferrer">Slush (Sui Wallet)</a> or <a href="https://suiet.app" target="_blank" rel="noreferrer">Suiet</a>.</li>
            <li><strong>Get a little SUI for gas</strong> — buy SUI and withdraw to your Sui address. A fraction of a SUI covers many transactions.</li>
            <li><strong>Swap for $LENZ</strong> — on a Sui DEX (Cetus, Turbos, BlueMove) or an aggregator, using the official coin type (published here once live).</li>
            <li><strong>Verify the coin type</strong> before swapping — only trade the official <code>&lt;package&gt;::lenz::LENZ</code> shown on this page, to avoid impostor coins.</li>
          </ol>
          <p className="lz-note">Never share your seed phrase. WalletLens and $LENZ will never ask for it, and never DM you a "claim" link.</p>
        </section>

        <section id="verify" className="lz-card lz-trust lz-section">
          <h2 className="lz-h2">Legitimacy — don't trust, verify</h2>
          <p>$LENZ is a real, long-term token, and every protection is independently verifiable on-chain. Once deployed, the official <strong>package id</strong> and <strong>coin type</strong> are published here and in the repo. Anyone can run <code>sui-token/scripts/verify-onchain.sh</code> to confirm:</p>
          <ul className="lz-checks">
            {CHECKS.map(c => <li key={c}>{c}</li>)}
          </ul>
          <div className="lz-warn">
            <strong>Beware of scams.</strong> The only official $LENZ package id and coin type live on this page and in the WalletLens repo. WalletLens will <strong>never</strong> DM you, never run a "claim/airdrop" site that asks you to connect a wallet or sign a transaction, and never asks for your seed phrase.
          </div>
        </section>

        <section className="lz-section">
          <h2 className="lz-h2 lz-center">Frequently asked questions</h2>
          <div className="lz-faq">
            {FAQS.map(f => (
              <details key={f.q} className="lz-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="lz-disclaimer">This page is informational only and is <strong>not financial advice</strong> and <strong>not an offer to sell a security</strong>. Tokenomics shown are draft launch parameters and may change. Do your own research.</p>
      </main>

      <footer className="lz-foot">
        <div className="lz-foot-brand"><LenzLogo size={26} /> <span>$LENZ · WalletLens</span></div>
        <nav className="lz-foot-links">
          <Link to="/">WalletLens</Link>
          <Link to="/about/">About</Link>
          <Link to="/privacy/">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}
