import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

// $LENZ — WalletLens's privacy token (SNIP-20 on Secret Network).
// This is an informational page. Numbers mirror lenz-token/TOKENOMICS.md;
// keep the two in sync. Nothing here is an offer to sell a security.

// 100% liquid at genesis — no vesting, no cliffs, no insider allocation.
const ALLOCATIONS = [
  { label: 'Community airdrop & rewards', pct: 50, lenz: 10_500_000, note: 'Airdrops to WalletLens users and contribution rewards' },
  { label: 'Liquidity', pct: 35, lenz: 7_350_000, note: 'DEX liquidity so a real price exists (LP locked)' },
  { label: 'Ecosystem / DAO treasury', pct: 15, lenz: 3_150_000, note: 'Governance-controlled — no team lock, no insider bag' },
]

const FAQS = [
  {
    q: 'What is $LENZ?',
    a: '$LENZ is the privacy token of the WalletLens ecosystem, issued as a SNIP-20 token on Secret Network. SNIP-20 tokens keep balances and transfer amounts encrypted on-chain, so your holdings are not visible on a public block explorer.',
  },
  {
    q: 'How is this different from an ERC-20 "privacy" token?',
    a: 'On Ethereum and most chains, every balance and transfer is public. Calling such a token a "privacy coin" would be misleading. SNIP-20 on Secret Network provides real, protocol-level privacy: you read your own balance with a viewing key or a signed permit, and outsiders cannot.',
  },
  {
    q: 'Does holding $LENZ change how WalletLens works?',
    a: 'No. WalletLens is and remains 100% free, with no account and all portfolio data on your device. $LENZ is a separate, optional ecosystem token — the core tracker never requires it.',
  },
  {
    q: 'What is the supply, and are there unlocks?',
    a: 'A low, hard cap of 21,000,000 LENZ with minting permanently disabled — no new tokens can ever be printed. 100% is liquid at genesis: there is no vesting, no cliffs, no locked tranches and no insider allocation, so there is no future unlock overhang. The hard cap is publicly verifiable on-chain, while individual balances and transfers stay private.',
  },
  {
    q: 'Is this financial advice or an investment offer?',
    a: 'No. This page is informational only. $LENZ is not financial advice and nothing here is an offer to sell a security. Privacy tokens are also delisted by many exchanges and may be regulated differently across jurisdictions. Do your own research.',
  },
]

export default function Lenz() {
  useEffect(() => {
    document.title = '$LENZ — WalletLens Privacy Token (SNIP-20 on Secret Network)'
  }, [])

  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>$LENZ — The Native Token of walletlens.live</h1>
        <p className="doc-meta">A low, hard-capped (21M), genuinely private token (SNIP-20 on Secret Network) — no unlocks, no vesting, no insider allocation.</p>

        <h2>What is $LENZ?</h2>
        <p><strong>$LENZ is the native token of <a href="https://walletlens.live" target="_blank" rel="noreferrer">walletlens.live</a></strong> — a 100% free, no-account, privacy-first all-asset portfolio tracker for crypto, stocks, precious metals, fiat and real estate, with AI insights and live prices, where all your data stays on your device.</p>
        <p>$LENZ is issued as a <strong>SNIP-20</strong> token on <a href="https://scrt.network" target="_blank" rel="noreferrer">Secret Network</a>, where <strong>balances and transfer amounts are encrypted on-chain</strong>. You read your own balance with a viewing key or a signed permit; outsiders cannot see it on a block explorer. That makes $LENZ an honest fit for WalletLens — a tracker whose whole premise is that your financial data is yours.</p>

        <h2>Why SNIP-20, not a "privacy" ERC-20</h2>
        <p>On Ethereum and most public chains, every balance and every transfer is visible to anyone. A token there with "privacy" in its name is not actually private. SNIP-20 gives privacy at the protocol level, which is why we chose Secret Network rather than minting a public token and calling it something it isn't.</p>

        <h2>Tokenomics — low cap, no unlocks</h2>
        <ul>
          <li><strong>Name / ticker:</strong> WalletLens / <strong>LENZ</strong></li>
          <li><strong>Standard:</strong> SNIP-20 (private balances &amp; transfers)</li>
          <li><strong>Chain:</strong> Secret Network (<code>secret-4</code> mainnet, <code>pulsar-3</code> testnet)</li>
          <li><strong>Max supply:</strong> 21,000,000 LENZ — low, hard cap, minting permanently disabled</li>
          <li><strong>Unlocks / vesting:</strong> none — 100% liquid at genesis, no cliffs, no insider allocation</li>
          <li><strong>Decimals:</strong> 6 (1 LENZ = 1,000,000 uLENZ)</li>
          <li><strong>Cap visibility:</strong> publicly verifiable on-chain — balances stay private</li>
        </ul>

        <h2>Distribution — 100% liquid at genesis</h2>
        <table className="lenz-table">
          <thead>
            <tr><th>Allocation</th><th>Share</th><th>LENZ</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {ALLOCATIONS.map(a => (
              <tr key={a.label}>
                <td>{a.label}</td>
                <td>{a.pct}%</td>
                <td>{a.lenz.toLocaleString()}</td>
                <td>{a.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="doc-meta">No vesting schedule exists because there is no team or insider allocation to vest — a stronger guarantee than any unlock schedule. The treasury is a transparent, governance-controlled wallet, and the liquidity LP is locked so it can't be pulled.</p>

        <h2>Proposed utility</h2>
        <ul>
          <li><strong>Governance</strong> — vote on the roadmap, supported assets, and treasury spend.</li>
          <li><strong>Usage rewards</strong> — earn LENZ for contributing (translations, content, referrals).</li>
          <li><strong>Private tipping</strong> — tip contributors privately, using SNIP-20's real on-chain privacy.</li>
          <li><strong>Hold-to-unlock cosmetics</strong> — optional flourishes that never gate the free core app.</li>
        </ul>

        <h2>Frequently asked questions</h2>
        <div className="doc-faq">
          {FAQS.map(f => (
            <details key={f.q} className="doc-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>

        <h2 id="disclaimer">Disclaimer</h2>
        <p>This page is informational only and is <strong>not financial advice</strong> and <strong>not an offer to sell a security</strong>. Privacy tokens are delisted by some exchanges and may be regulated differently across jurisdictions. Tokenomics shown are draft launch parameters and may change. Do your own research.</p>
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/about">About</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  )
}
