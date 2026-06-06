import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

// $LENZ — WalletLens's privacy token (SNIP-20 on Secret Network).
// This is an informational page. Numbers mirror lenz-token/TOKENOMICS.md;
// keep the two in sync. Nothing here is an offer to sell a security.

const ALLOCATIONS = [
  { label: 'Community & rewards', pct: 40, note: 'Airdrops to WalletLens users and usage rewards' },
  { label: 'Ecosystem & liquidity', pct: 25, note: 'DEX liquidity and listings' },
  { label: 'Team', pct: 15, note: 'Vested via a timelock/multisig — never a single wallet at launch' },
  { label: 'Treasury / DAO', pct: 15, note: 'Governance-controlled' },
  { label: 'Public sale', pct: 5, note: 'Optional' },
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
    q: 'Is the supply fixed?',
    a: 'The launch configuration is a fixed 100,000,000 LENZ with minting disabled, so no new tokens can be printed after launch. Total supply is kept private, consistent with a privacy token.',
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
        <h1>$LENZ — The WalletLens Privacy Token</h1>
        <p className="doc-meta">A genuinely private token (SNIP-20 on Secret Network) — encrypted balances and transfers, built for a privacy-first product.</p>

        <h2>What is $LENZ?</h2>
        <p><strong>$LENZ</strong> is the privacy token of the WalletLens ecosystem. It is issued as a <strong>SNIP-20</strong> token on <a href="https://scrt.network" target="_blank" rel="noreferrer">Secret Network</a>, where <strong>balances and transfer amounts are encrypted on-chain</strong>. You read your own balance with a viewing key or a signed permit; outsiders cannot see it on a block explorer. That makes $LENZ an honest fit for WalletLens — a tracker whose whole premise is that your financial data is yours.</p>

        <h2>Why SNIP-20, not a "privacy" ERC-20</h2>
        <p>On Ethereum and most public chains, every balance and every transfer is visible to anyone. A token there with "privacy" in its name is not actually private. SNIP-20 gives privacy at the protocol level, which is why we chose Secret Network rather than minting a public token and calling it something it isn't.</p>

        <h2>Tokenomics</h2>
        <ul>
          <li><strong>Name / ticker:</strong> WalletLens / <strong>LENZ</strong></li>
          <li><strong>Standard:</strong> SNIP-20 (private balances &amp; transfers)</li>
          <li><strong>Chain:</strong> Secret Network (<code>secret-4</code> mainnet, <code>pulsar-3</code> testnet)</li>
          <li><strong>Total supply:</strong> 100,000,000 LENZ — fixed, minting disabled</li>
          <li><strong>Decimals:</strong> 6 (1 LENZ = 1,000,000 uLENZ)</li>
          <li><strong>Total supply visibility:</strong> private, consistent with a privacy token</li>
        </ul>

        <h2>Distribution</h2>
        <table className="lenz-table">
          <thead>
            <tr><th>Allocation</th><th>Share</th><th>LENZ</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {ALLOCATIONS.map(a => (
              <tr key={a.label}>
                <td>{a.label}</td>
                <td>{a.pct}%</td>
                <td>{(a.pct * 1_000_000).toLocaleString()}</td>
                <td>{a.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="doc-meta">Team and treasury allocations are intended to vest through a timelock or multisig with a published schedule — not parked in a single wallet at launch.</p>

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
