import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

const FAQS = [
  {
    q: 'Is WalletLens really free?',
    a: 'Yes. WalletLens is 100% free with no paid tiers, no premium paywall, and no freemium limits. You can track unlimited assets, use the AI analysis, and export backups without ever paying. The app is sustained by unobtrusive advertising.',
  },
  {
    q: 'Do I need an account or email to use it?',
    a: 'No. There is no sign-up, no email, and no password. You open the app and start tracking immediately. Because there is no account, there is nothing to hack, leak, or lock you out of.',
  },
  {
    q: 'Where is my portfolio data stored?',
    a: "Entirely in your own browser's localStorage on your device. WalletLens has no backend database and no server that receives your holdings. Your financial data never leaves your device unless you choose to export a backup code.",
  },
  {
    q: 'What assets can I track in one place?',
    a: 'Crypto (10,000+ coins), US stocks and ETFs, gold, silver, platinum, fiat currencies, cash, and bonds — all in a single net worth dashboard with live prices, cost basis, and profit/loss.',
  },
  {
    q: 'How is WalletLens different from CoinStats, Empower, or Kubera?',
    a: 'Most trackers either focus only on crypto, charge a subscription, require you to connect exchange or bank logins, or store your data on their servers. WalletLens covers every asset class, is free forever, needs no logins, and keeps all data on your device.',
  },
  {
    q: 'Can I use WalletLens on my phone?',
    a: 'Yes. WalletLens is a Progressive Web App (PWA) — install it to your home screen on iOS, Android, or desktop for a fast, app-like experience that works offline.',
  },
  {
    q: 'How do I move my portfolio to a new device?',
    a: 'Export your portfolio as a compact WLZ backup code, then import it on any other device in seconds. No cloud sync and no account required.',
  },
]

export default function About() {
  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>About WalletLens — The Free, Private Net Worth Tracker</h1>
        <p className="doc-meta">Track crypto, stocks, gold, silver, cash &amp; FX in one dashboard — free, no account, data stays on your device</p>

        <h2>What is WalletLens?</h2>
        <p>WalletLens is a <strong>free net worth tracker</strong> and all-asset portfolio manager that lets you track every investment you own — crypto, US stocks, ETFs, gold, silver, fiat currencies, cash, and bonds — in one unified dashboard. It runs entirely in your browser with no account, no server, and no subscription fee, so you can see your <strong>entire net worth in one place</strong> in seconds.</p>
        <p>The name comes from the idea of a lens: a tool that brings distant, complex things into sharp focus. WalletLens does exactly that for your wealth — pulling every scattered holding into a single, clear picture.</p>

        <h2>Why We Built It</h2>
        <p>Most portfolio trackers either support only crypto, require a paid subscription, demand access to your exchange or bank accounts, or send your financial data to a third-party server. We wanted something different — a tool that respects your privacy, works offline, and covers every asset class a modern investor cares about.</p>
        <p>WalletLens was built on the principle that <strong>your financial data belongs to you</strong>. Everything you enter stays on your device in browser localStorage. There is no backend database, no user accounts, and no analytics tied to your portfolio.</p>

        <h2>Who WalletLens Is For</h2>
        <ul>
          <li><strong>Multi-asset investors</strong> who hold crypto <em>and</em> stocks <em>and</em> precious metals and are tired of juggling three different apps.</li>
          <li><strong>Privacy-conscious people</strong> who don't want to connect bank logins or hand their holdings to a cloud server.</li>
          <li><strong>Anyone who wants a free net worth tracker</strong> without a subscription, a trial, or a credit card.</li>
          <li><strong>DIY investors</strong> who want cost-basis tracking, profit targets, and clear profit/loss without a spreadsheet.</li>
        </ul>

        <h2>Key Features</h2>
        <ul>
          <li><strong>Multi-asset tracking</strong> — Crypto (10,000+ coins via CoinGecko), US stocks (Stooq), gold and silver (live XAU/USD, XAG/USD), fiat currencies, and bonds.</li>
          <li><strong>Portfolio Analysis</strong> — On-device intelligence that scores your portfolio health, runs stress tests, analyses entry quality, plans rebalancing, and displays a Fear &amp; Greed gauge — all computed from your own data.</li>
          <li><strong>Multi-target sell plans</strong> — Set up to five price targets per asset with progress bars and projected proceeds, so you always know when to take profit.</li>
          <li><strong>Whale Tracker</strong> — Monitor large Bitcoin transactions from the mempool, market movers, volume anomalies, and CoinGecko trending searches.</li>
          <li><strong>Smart trade entry</strong> — A bottom sheet with coin search, live price auto-fill, "Buy With" and "Sell For" counter-legs, and wallet tagging.</li>
          <li><strong>Share Your Gains</strong> — Generate a beautiful portfolio card image (1200×630) and share it to X, download it, or copy it to your clipboard.</li>
          <li><strong>Backup codes</strong> — Export your entire portfolio as a compact WLZ code. Import it on any device in seconds — no cloud required.</li>
          <li><strong>PWA</strong> — Install WalletLens to your home screen on iOS, Android, or desktop for an app-like experience.</li>
        </ul>

        <h2>Completely Free</h2>
        <p>WalletLens is and will always be free to use. There are no paid tiers, no premium features locked behind a paywall, and no freemium limits. The app is sustained by Google AdSense advertising.</p>

        <h2>Privacy by Design</h2>
        <p>We chose a local-first architecture deliberately. Your portfolio is your most sensitive financial information. By keeping it in your browser's localStorage instead of a server, we eliminate the risk of a data breach, account takeover, or unauthorised access. The trade-off is that you are responsible for your own backups — use the WLZ export regularly.</p>

        <h2>Frequently Asked Questions</h2>
        <div className="doc-faq">
          {FAQS.map(f => (
            <details key={f.q} className="doc-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>

        <h2>Get Started</h2>
        <p>Ready to see your whole net worth in one place? <Link to="/dashboard/">Open WalletLens free</Link> — no account needed. New to portfolio tracking? Start with our guide to the <Link to="/blog/best-free-net-worth-tracker/">best free net worth tracker</Link>, or browse all our <Link to="/blog/">investing guides on the blog</Link>.</p>

        <h2>Open Source</h2>
        <p>WalletLens is open source. You can inspect the code, report issues, or contribute on <a href="https://github.com/tia8910/walletlens" target="_blank" rel="noreferrer">GitHub</a>.</p>

        <h2>Contact</h2>
        <p>Have feedback, found a bug, or want to suggest a feature? Email us at <a href="mailto:contact@walletlens.live">contact@walletlens.live</a> — we read everything.</p>
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/blog/">Blog</Link>
        <Link to="/privacy/">Privacy Policy</Link>
      </footer>
    </div>
  )
}
