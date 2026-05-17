import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

export default function Privacy() {
  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>Privacy Policy</h1>
        <p className="doc-meta">Last updated: May 2026</p>

        <p>WalletLens ("we", "our", or "the app") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and what choices you have.</p>

        <h2>1. No Account Required</h2>
        <p>WalletLens does not require you to create an account, provide an email address, or submit any personal identification. You can use the full app anonymously.</p>

        <h2>2. Local-First Data Storage</h2>
        <p>All portfolio data — including your wallets, transactions, holdings, and price targets — is stored exclusively in your browser's <code>localStorage</code>. This data never leaves your device and is never transmitted to any WalletLens server, because no such server exists for user data.</p>
        <p>To transfer your data between devices, you can export a WLZ backup code from the Dashboard. This code is a compressed, base64-encoded representation of your local data. You control when and how it is shared.</p>

        <h2>3. Third-Party Price APIs</h2>
        <p>WalletLens fetches live market prices from the following public APIs. These requests originate from your browser and are subject to each provider's privacy policy:</p>
        <ul>
          <li><strong>CoinGecko</strong> — cryptocurrency prices and market data (coingecko.com)</li>
          <li><strong>Binance</strong> — cryptocurrency prices (binance.com)</li>
          <li><strong>CoinCap</strong> — cryptocurrency fallback prices (coincap.io)</li>
          <li><strong>Gold-API</strong> — gold and silver spot prices (gold-api.com)</li>
          <li><strong>Stooq</strong> — US and global stock prices (stooq.com)</li>
          <li><strong>ExchangeRate APIs</strong> — fiat currency exchange rates</li>
          <li><strong>Blockchain.info</strong> — unconfirmed Bitcoin mempool data for the Whale Tracker</li>
        </ul>
        <p>These APIs receive your IP address as part of the HTTP request. WalletLens does not send any personal portfolio data to these services.</p>

        <h2>4. Analytics</h2>
        <p>We use <strong>Google Analytics (GA4)</strong> to understand aggregate usage patterns such as page views, session duration, and device type. This helps us improve the app. Google Analytics uses cookies and may collect your IP address and browser information. You can opt out using the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">Google Analytics Opt-out Browser Add-on</a>.</p>

        <h2>5. Advertising</h2>
        <p>WalletLens participates in the <strong>Google AdSense</strong> program. Google may serve ads based on your browsing behaviour using cookies. You can manage your ad personalisation preferences at <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">adssettings.google.com</a>.</p>

        <h2>6. Cookies</h2>
        <p>WalletLens itself does not set any first-party cookies beyond what is strictly necessary for the app to function. Third-party services (Google Analytics, Google AdSense) may set their own cookies as described in their respective privacy policies.</p>

        <h2>7. Children's Privacy</h2>
        <p>WalletLens is not directed at children under the age of 13. We do not knowingly collect personal information from children.</p>

        <h2>8. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "last modified" date. Continued use of the app after changes constitutes acceptance of the revised policy.</p>

        <h2>9. Contact</h2>
        <p>If you have any questions about this Privacy Policy, please open an issue on our <a href="https://github.com/tia8910/walletlens" target="_blank" rel="noreferrer">GitHub repository</a>.</p>
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/terms">Terms of Service</Link>
        <Link to="/about">About</Link>
        <Link to="/blog">Blog</Link>
        <a className="lp-footer-x" href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer">
          <svg className="lp-x-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          @walletlenss
        </a>
      </footer>
    </div>
  )
}
