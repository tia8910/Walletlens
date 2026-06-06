import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import LenzLogo from '../components/LenzLogo'

// $LENZ — native token of walletlens.live. A self-contained, premium, dark
// landing experience with its own identity (see LenzLogo). Scoped under .lz-*
// so it never affects the rest of the site. Numbers mirror lenz-token/TOKENOMICS.md.

const ALLOCATIONS = [
  { label: 'Community airdrop & rewards', pct: 50, lenz: 10_500_000, note: 'Airdrops to WalletLens users and contribution rewards' },
  { label: 'Liquidity', pct: 35, lenz: 7_350_000, note: 'DEX liquidity so a real price exists (LP locked)' },
  { label: 'Ecosystem / DAO treasury', pct: 15, lenz: 3_150_000, note: 'Governance-controlled — no team lock, no insider bag' },
]

const STATS = [
  { k: 'Max supply', v: '21,000,000', s: 'LENZ — hard cap, mint disabled' },
  { k: 'Unlocks', v: 'None', s: '100% liquid at genesis' },
  { k: 'Decimals', v: '6', s: '1 LENZ = 1,000,000 uLENZ' },
  { k: 'Supply cap', v: 'Verifiable', s: 'public on-chain — balances private' },
]

const UTILITY = [
  { t: 'Governance', d: 'Vote on the roadmap, supported assets, and treasury spend.' },
  { t: 'Usage rewards', d: 'Earn LENZ for contributing — translations, content, referrals.' },
  { t: 'Private tipping', d: "Tip contributors privately using SNIP-20's on-chain privacy." },
  { t: 'Hold-to-unlock', d: 'Optional cosmetics that never gate the free core app.' },
]

const CHECKS = [
  'Audited bytecode — on-chain code hash matches the audited snip20-reference-impl build',
  'Fixed supply — minting permanently disabled (hard cap 21,000,000 LENZ)',
  'No unlocks, no insider bag — 100% liquid at genesis, distribution wallets published',
  'No admin rug — admin renounced or a published multisig (mint is off regardless)',
  'Locked liquidity and a non-upgradeable contract',
]

const FAQS = [
  { q: 'What is $LENZ?', a: '$LENZ is the native token of walletlens.live — a free, no-account, privacy-first all-asset portfolio tracker. It is issued as a SNIP-20 token on Secret Network, which keeps balances and transfer amounts encrypted on-chain, so holdings are not visible on a public block explorer.' },
  { q: 'How is this different from an ERC-20 "privacy" token?', a: 'On Ethereum and most chains, every balance and transfer is public, so a token there with "privacy" in its name is not actually private. SNIP-20 on Secret Network provides real, protocol-level privacy: you read your own balance with a viewing key or signed permit, and outsiders cannot.' },
  { q: 'Does holding $LENZ change how WalletLens works?', a: 'No. WalletLens remains 100% free, with no account and all portfolio data on your device. $LENZ is a separate, optional ecosystem token; the core tracker never requires it.' },
  { q: 'What is the supply, and are there unlocks?', a: 'A low, hard cap of 21,000,000 LENZ with minting permanently disabled — no new tokens can ever be printed. 100% is liquid at genesis: no vesting, no cliffs, no locked tranches and no insider allocation, so there is no future unlock overhang. The hard cap is publicly verifiable on-chain, while individual balances and transfers stay private.' },
  { q: 'How do I know $LENZ is not a scam?', a: 'Because you can verify it instead of trusting it. The deployed contract runs the audited snip20-reference-impl, minting is permanently disabled, there is no team/insider allocation or vesting unlock, the admin is renounced or a published multisig, and liquidity is locked. The repo ships a verify-onchain.sh script that checks all of this and prints a PASS/FAIL report.' },
  { q: 'Is this financial advice or an investment offer?', a: 'No. This page is informational only. $LENZ is not financial advice and nothing here is an offer to sell a security. Privacy tokens are also delisted by many exchanges and may be regulated differently across jurisdictions. Do your own research.' },
]

export default function Lenz() {
  useEffect(() => {
    document.title = '$LENZ — WalletLens Privacy Token (SNIP-20 on Secret Network)'
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
        <p className="lz-tagline">The privacy token of WalletLens — a low, hard-capped, genuinely private <strong>SNIP-20</strong> coin on <strong>Secret Network</strong>. No unlocks. No insider bag. Verifiable.</p>
        <div className="lz-chips">
          <span className="lz-chip"><b>21M</b> hard cap</span>
          <span className="lz-chip"><b>0</b> unlocks</span>
          <span className="lz-chip">SNIP-20</span>
          <span className="lz-chip">Secret Network</span>
        </div>
        <div className="lz-cta">
          <a href="#verify" className="lz-btn lz-btn-primary">Verify on-chain</a>
          <a href="#hold" className="lz-btn lz-btn-ghost">How to hold</a>
        </div>
      </section>

      <main className="lz-main">
        <div className="lz-cards2">
          <section className="lz-card">
            <h2 className="lz-h2">What is $LENZ?</h2>
            <p>$LENZ is the native token of <a href="https://walletlens.live" target="_blank" rel="noreferrer">walletlens.live</a> — a 100% free, no-account, privacy-first all-asset portfolio tracker for crypto, stocks, precious metals, fiat and real estate, with AI insights and live prices, where all your data stays on your device.</p>
            <p>Issued as a SNIP-20 on Secret Network, <strong>balances and transfers are encrypted on-chain</strong> — an honest fit for a privacy-first product.</p>
          </section>
          <section className="lz-card">
            <h2 className="lz-h2">Why SNIP-20, not a "privacy" ERC-20</h2>
            <p>On Ethereum and most public chains, every balance and every transfer is visible to anyone — a token there with "privacy" in its name is not actually private.</p>
            <p>SNIP-20 gives privacy at the <strong>protocol level</strong>. You read your own balance with a viewing key or signed permit; outsiders cannot. That's why $LENZ lives on Secret Network rather than a public chain.</p>
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
          <h2 className="lz-h2">How to hold $LENZ <span className="lz-sub">(wallet &amp; gas)</span></h2>
          <p>$LENZ lives on Secret Network, so you need a Secret-compatible wallet and a little SCRT for gas. Because balances are encrypted, you also create a <strong>viewing key</strong> to see your own balance.</p>
          <ol className="lz-steps">
            <li><strong>Install a wallet</strong> — <a href="https://www.keplr.app" target="_blank" rel="noreferrer">Keplr</a> or <a href="https://www.leapwallet.io" target="_blank" rel="noreferrer">Leap</a>. Both support Secret Network (<code>secret-4</code>).</li>
            <li><strong>Get a little SCRT for gas</strong> — buy SCRT and withdraw to your Secret address, or bridge in. A fraction of an SCRT covers many transactions.</li>
            <li><strong>Add the $LENZ token</strong> — import it by its contract address (published here once live).</li>
            <li><strong>Create a viewing key</strong> — your wallet prompts for this when you add $LENZ; it lets only you decrypt your balance.</li>
          </ol>
          <p className="lz-note">Never share your seed phrase. A viewing key only reveals your balance to whoever holds it; your seed phrase controls your funds — WalletLens and $LENZ will never ask for either.</p>
        </section>

        <section id="verify" className="lz-card lz-trust lz-section">
          <h2 className="lz-h2">Legitimacy — don't trust, verify</h2>
          <p>$LENZ is a real, long-term token, and every protection is independently verifiable on-chain. Once deployed, the official contract address and audited <strong>code hash</strong> are published here and in the repo. Anyone can run <code>lenz-token/scripts/verify-onchain.sh</code> to confirm:</p>
          <ul className="lz-checks">
            {CHECKS.map(c => <li key={c}>{c}</li>)}
          </ul>
          <div className="lz-warn">
            <strong>Beware of scams.</strong> The only official $LENZ contract address and code hash live on this page and in the WalletLens repo. WalletLens will <strong>never</strong> DM you, never run a "claim/airdrop" site that asks you to connect a wallet or sign a transaction, and never asks for your seed phrase or viewing key.
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

        <p className="lz-disclaimer">This page is informational only and is <strong>not financial advice</strong> and <strong>not an offer to sell a security</strong>. Privacy tokens are delisted by some exchanges and may be regulated differently across jurisdictions. Tokenomics shown are draft launch parameters and may change. Do your own research.</p>
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
