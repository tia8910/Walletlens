import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

export default function About() {
  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>About WalletLens</h1>
        <p className="doc-meta">The free, private, all-asset portfolio tracker</p>

        <h2>What is WalletLens?</h2>
        <p>WalletLens is a free, open-source portfolio tracker that lets you monitor all your investments — crypto, US stocks, gold, silver, fiat currencies, and bonds — in one unified dashboard. It runs entirely in your browser with no account, no server, and no subscription fee.</p>
        <p>The name comes from the idea of a lens: a tool that brings distant, complex things into sharp focus. WalletLens does exactly that for your wealth.</p>

        <h2>Why We Built It</h2>
        <p>Most portfolio trackers either support only crypto, require a paid subscription, demand access to your exchange accounts, or send your financial data to a third-party server. We wanted something different — a tool that respects your privacy, works offline, and covers every asset class a modern investor cares about.</p>
        <p>WalletLens was built on the principle that <strong>your financial data belongs to you</strong>. Everything you enter stays on your device in browser localStorage. There is no backend database, no user accounts, and no analytics tied to your portfolio.</p>

        <h2>Key Features</h2>
        <ul>
          <li><strong>Multi-asset tracking</strong> — Crypto (10,000+ coins via CoinGecko), US stocks (Stooq), gold and silver (live XAU/USD, XAG/USD), fiat currencies, and bonds.</li>
          <li><strong>AI Portfolio Analysis</strong> — On-device intelligence that scores your portfolio health, runs stress tests, analyses entry quality, plans rebalancing, and displays a Fear &amp; Greed gauge — all computed from your own data with no external AI API.</li>
          <li><strong>Multi-target sell plans</strong> — Set up to five price targets per asset with progress bars and projected proceeds, so you always know when to take profit.</li>
          <li><strong>Whale Tracker</strong> — Monitor large Bitcoin transactions from the mempool, market movers, volume anomalies, and CoinGecko trending searches.</li>
          <li><strong>Smart trade entry</strong> — A bottom sheet with coin search, live price auto-fill, "Buy With" and "Sell For" counter-legs, and wallet tagging.</li>
          <li><strong>Share Your Gains</strong> — Generate a beautiful portfolio card image (1200×630) and share it to X/Twitter, download it, or copy it to your clipboard.</li>
          <li><strong>Backup codes</strong> — Export your entire portfolio as a compact WLZ code. Import it on any device in seconds — no cloud required.</li>
          <li><strong>PWA</strong> — Install WalletLens to your home screen on iOS, Android, or desktop for an app-like experience.</li>
        </ul>

        <h2>Completely Free</h2>
        <p>WalletLens is and will always be free to use. There are no paid tiers, no premium features locked behind a paywall, and no freemium limits. The app is sustained by Google AdSense advertising.</p>

        <h2>Privacy by Design</h2>
        <p>We chose a local-first architecture deliberately. Your portfolio is your most sensitive financial information. By keeping it in your browser's localStorage instead of a server, we eliminate the risk of a data breach, account takeover, or unauthorised access. The trade-off is that you are responsible for your own backups — use the WLZ export regularly.</p>

        <h2>Open Source</h2>
        <p>WalletLens is open source. You can inspect the code, report issues, or contribute on <a href="https://github.com/tia8910/walletlens" target="_blank" rel="noreferrer">GitHub</a>.</p>

        <h2>Contact</h2>
        <p>Have feedback, found a bug, or want to suggest a feature? Open an issue on <a href="https://github.com/tia8910/walletlens" target="_blank" rel="noreferrer">GitHub</a>. We read every issue.</p>
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/blog">Blog</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  )
}
