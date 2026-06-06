import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import LenzLogo from '../components/LenzLogo'

// $LENZ — native token of walletlens.live. A self-contained, premium, dark
// landing experience with its own identity (see LenzLogo). Scoped under .lz-*
// so it never affects the rest of the site. Numbers mirror sui-token/TOKENOMICS.md.

const ALLOCATIONS = [
  { label: 'Community airdrop & rewards', pct: 50, lenz: 5_000_000, note: 'Airdrops to WalletLens users and contribution rewards' },
  { label: 'Liquidity', pct: 35, lenz: 3_500_000, note: 'DEX liquidity so a real price exists (LP locked)' },
  { label: 'Ecosystem / DAO treasury', pct: 15, lenz: 1_500_000, note: 'Governance-controlled — no team lock, no insider bag' },
]

const STATS = [
  { k: 'Max supply', v: '10,000,000', s: 'LENZ — hard cap, minting locked' },
  { k: 'Unlocks', v: 'None', s: '100% liquid at genesis' },
  { k: 'Chain', v: 'Sui', s: 'fast, low-fee, easy to buy' },
  { k: 'Supply', v: 'Verifiable', s: 'TreasuryCap frozen on-chain' },
]

const UTILITY = [
  { t: 'Governance', d: 'Vote on the roadmap, supported assets, and treasury spend.' },
  { t: 'Usage rewards', d: 'Earn LENZ for contributing — translations, content, referrals.' },
  { t: 'Community tipping', d: 'Tip and reward contributors directly on Sui — fast and low-fee.' },
  { t: 'Hold-to-unlock', d: 'Optional cosmetics that never gate the free core app.' },
]

const CHECKS = [
  'Fixed supply — total supply is 10,000,000 LENZ',
  'Minting locked forever — the TreasuryCap is frozen on-chain, so no one can ever mint again',
  'No unlocks, no insider bag — 100% liquid at genesis, distribution wallets published',
  'Immutable metadata — name, symbol, decimals and icon are frozen',
  'No admin, no upgrade hook — a tiny standard coin module with no logic to abuse',
  'Locked liquidity (LP locked so it cannot be pulled)',
]

const FAQS = [
  { q: 'What is $LENZ?', a: '$LENZ is the native token of walletlens.live — a free, no-account, privacy-first all-asset portfolio tracker. It is a standard Sui coin with a fixed 10,000,000 supply and locked minting, used as the utility and governance token of the WalletLens ecosystem.' },
  { q: 'Why Sui?', a: 'Sui is fast and low-fee with a large, growing ecosystem, so $LENZ is easy to buy (Cetus, Turbos, BlueMove, DeepBook and aggregators) and easy to list — CoinGecko and CoinMarketCap applications are free. The Move coin module is small and standard.' },
  { q: 'Is $LENZ private?', a: 'No — and we will not pretend otherwise. Sui is a public chain, so balances and transfers are visible on a block explorer. The privacy is in the product: WalletLens keeps all your portfolio data on your device. $LENZ is the native/utility token of that privacy-first app, not a "privacy coin."' },
  { q: 'Does holding $LENZ change how WalletLens works?', a: 'No. WalletLens remains 100% free, with no account and all portfolio data on your device. $LENZ is a separate, optional ecosystem token; the core tracker never requires it.' },
  { q: 'What is the supply, and are there unlocks?', a: 'A low, hard cap of 10,000,000 LENZ. The entire supply is minted once at publish and the TreasuryCap is then frozen, so no new tokens can ever be created. 100% is liquid at genesis: no vesting, no cliffs, no locked tranches and no insider allocation, so there is no future unlock overhang.' },
  { q: 'How do I know $LENZ is not a scam?', a: 'Because you can verify it instead of trusting it. The total supply is fixed at 10,000,000, the TreasuryCap is frozen (minting permanently impossible), the metadata is immutable, there is no team/insider allocation or vesting unlock, and liquidity is locked. The repo ships a verify-onchain.sh script that checks all of this and prints a PASS/FAIL report. The only official package id and coin type are published on this page and in the WalletLens repo.' },
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
        <p className="lz-tagline">The native token of WalletLens — a low, hard-capped <strong>10M</strong> coin on <strong>Sui</strong>. No unlocks. No insider bag. Supply locked. Verifiable.</p>
        <div className="lz-badges">
          <span className="lz-badge">🎁 Free airdrop</span>
          <span className="lz-badge">🚫 No sale · No IPO</span>
          <span className="lz-badge">⚖️ Fair distribution</span>
          <span className="lz-badge">🔒 Supply locked</span>
        </div>
        <div className="lz-chips">
          <span className="lz-chip"><b>10M</b> hard cap</span>
          <span className="lz-chip"><b>0</b> unlocks</span>
          <span className="lz-chip">Built on Sui</span>
          <span className="lz-chip">Supply locked</span>
        </div>
        <div className="lz-cta">
          <Link to="/airdrop" className="lz-btn lz-btn-primary">Join the airdrop</Link>
          <a href="#verify" className="lz-btn lz-btn-ghost">Verify on-chain</a>
          <a href="#hold" className="lz-btn lz-btn-ghost">How to hold</a>
        </div>
      </section>

      <main className="lz-main">
        <div className="lz-cards2">
          <section className="lz-card">
            <h2 className="lz-h2">What is $LENZ?</h2>
            <p>$LENZ is the native token of <a href="https://walletlens.live" target="_blank" rel="noreferrer">walletlens.live</a> — a 100% free, no-account, privacy-first all-asset portfolio tracker for crypto, stocks, precious metals, fiat and real estate, with AI insights and live prices, where all your data stays on your device.</p>
            <p>It is a <strong>standard Sui coin</strong> with a fixed 10,000,000 supply and minting locked forever — the utility &amp; governance token of the WalletLens ecosystem.</p>
          </section>
          <section className="lz-card">
            <h2 className="lz-h2">Why Sui</h2>
            <p>Sui is fast and low-fee with a large, growing ecosystem — so $LENZ is <strong>easy to buy</strong> (Cetus, Turbos, BlueMove, DeepBook and aggregators) and <strong>easy to list</strong> (CoinGecko / CoinMarketCap applications are free).</p>
            <p>Sui is a public chain, so $LENZ is the native/utility token of a privacy-first app — <strong>not a "privacy coin."</strong> The privacy is in the product: your portfolio data stays on your device.</p>
          </section>
        </div>

        <section id="tokenomics" className="lz-card lz-section">
          <h2 className="lz-h2">Tokenomics — low cap, no unlocks</h2>
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
          <h2 className="lz-h2">Distribution — 100% liquid at genesis</h2>
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
          <p className="lz-note">No vesting schedule exists because there is no team or insider allocation to vest — a stronger guarantee than any unlock schedule. The treasury is a transparent, governance-controlled wallet, and the liquidity LP is locked.</p>
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
          <Link to="/about">About</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  )
}
