import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'

export default function Privacy() {
  const { t, lang } = useLanguage()
  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>Privacy Policy</h1>
        <p className="doc-meta">Last updated: August 2026</p>
        {lang !== 'en' && (
          <p className="doc-meta" style={{ fontStyle: 'italic' }}>{t('legalEnglishGoverns')}</p>
        )}

        <p>WalletLens ("we", "our", or "the app") is committed to protecting your privacy. This policy explains what information we collect, how we use it, and what choices you have.</p>

        <h2>1. No Account Required</h2>
        <p>WalletLens does not require you to create an account, provide an email address, or submit any personal identification. You can use the full app anonymously. Several optional features described in section 3 do ask for an email address or a Google sign-in; none of them is needed to track a portfolio, and each is off until you turn it on.</p>

        <h2>2. Local-First by Default</h2>
        <p>Your portfolio — wallets, transactions, holdings, and price targets — is stored in your browser's <code>localStorage</code>. In its default configuration WalletLens has no user accounts and no database: if you never enable any feature in section 3, your portfolio is never transmitted to us and we have no way to see it.</p>
        <p>To move your data between devices yourself, you can export a WLZ backup code from the Dashboard. This code is a compressed, base64-encoded representation of your local data. You control when and how it is shared.</p>

        <h2>3. Optional Features That Send Data Off Your Device</h2>
        <p>The following features are opt-in and each one transmits data to our server at <code>walletlens-voice-parse.tia8910.deno.net</code>, which sends mail through Resend and, where noted, relays requests to Anthropic. We list exactly what leaves your device so you can decide feature by feature:</p>
        <ul>
          <li><strong>Email backup</strong> — your email address and your <em>complete backup code</em>, which contains your full portfolio. It is emailed to you and not retained after sending.</li>
          <li><strong>Weekly report</strong> — your email address, an anonymous device identifier, your total portfolio value, your week-on-week change, and your largest holdings with their symbols, values and profit/loss. This snapshot is stored so the weekly email can be sent on schedule, and is replaced each time the app refreshes it.</li>
          <li><strong>Portfolio Guardian</strong> — an anonymous device identifier, a summary of your portfolio, and the names and email addresses of the heirs you nominate. Stored so we can contact them if your check-ins stop.</li>
          <li><strong>Price alerts and push notifications</strong> — your browser's push endpoint and your alert list, which includes the assets you watch and your target prices. Stored so alerts can be delivered while the app is closed.</li>
          <li><strong>AI features</strong> (voice entry, screenshot import, assistant, Magic Indicator, vision advice) — the text, audio transcript or image you supply, together with the portfolio context needed to answer. Unless you provide your own API key, these are relayed through our server to <strong>Anthropic</strong> and are subject to Anthropic's privacy policy. We do not retain them.</li>
        </ul>
        <p>You can stop any of these at any time from Settings; unsubscribing deletes the stored record for that feature. To have everything associated with your device removed, email us at the address in section 10.</p>

        <h2>4. Google Drive Backup</h2>
        <p>If you choose to connect Google Drive, WalletLens requests only the <code>drive.file</code> scope, which grants access solely to the single backup file the app itself creates — it cannot see anything else in your Drive. The backup is encrypted in your browser with a passphrase you choose before it is uploaded, using AES-GCM with a key derived by PBKDF2.</p>
        <p>The file is stored in <em>your</em> Google Drive, not on our servers, and it does not pass through them. Your Google sign-in token stays in your browser's memory and is never sent to us. Because the passphrase is never stored or transmitted, neither we nor Google can read the contents of the backup — and if you lose the passphrase, nobody can recover it.</p>

        <h2>5. Third-Party Price APIs</h2>
        <p>WalletLens fetches live market prices from the following public APIs. These requests originate from your browser and are subject to each provider's privacy policy:</p>
        <ul>
          <li><strong>CoinGecko</strong> — cryptocurrency prices and market data (coingecko.com)</li>
          <li><strong>Binance</strong> — cryptocurrency prices (binance.com)</li>
          <li><strong>CoinCap</strong> — cryptocurrency fallback prices (coincap.io)</li>
          <li><strong>Gold-API</strong> — gold and silver spot prices (gold-api.com)</li>
          <li><strong>Stooq</strong> — US and global stock prices (stooq.com)</li>
          <li><strong>ExchangeRate APIs</strong> — fiat currency exchange rates</li>
          <li><strong>Blockchain.info</strong> — unconfirmed Bitcoin mempool data for the Whale Tracker</li>
          <li><strong>Finnhub, Alpha Vantage, Yahoo Finance</strong> — stock quotes and company data</li>
          <li><strong>CryptoCompare, CoinPaprika, Kraken, Blockchair</strong> — additional cryptocurrency prices and on-chain data</li>
          <li><strong>GoPlus Labs</strong> — token safety checks</li>
          <li><strong>Frankfurter, exchangerate.host, open.er-api.com</strong> — fiat exchange rates</li>
          <li><strong>rss2json</strong> — news headlines; <strong>wsrv.nl</strong> — image resizing for asset logos</li>
        </ul>
        <p>When a direct request is blocked by a provider's CORS policy, it is relayed through a proxy — either our own server or one of the public services <code>corsproxy.io</code>, <code>allorigins.win</code>, <code>cors.eu.org</code> or <code>api.codetabs.com</code>. The relayed request contains the same market-data lookup and no portfolio contents.</p>
        <p>These services receive your IP address, and the lookups tell them which assets you are viewing — which, for assets you hold, indicates the composition of your portfolio. They are never sent your amounts, transactions, wallet names or valuations.</p>

        <h2>6. Analytics</h2>
        <p>We use <strong>Google Analytics (GA4)</strong> to understand aggregate usage patterns such as page views, session duration, and device type. This helps us improve the app. Google Analytics uses cookies and may collect your IP address and browser information. You can opt out using the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noreferrer">Google Analytics Opt-out Browser Add-on</a>.</p>
        <p>Analytics events record <em>which</em> features are used, never what you own. Ad-personalisation signals are disabled, and no event carries asset symbols, amounts, valuations, profit or loss, or anything you have typed. On the web, an X (Twitter) advertising pixel also loads to measure referrals from our posts there; it is not included in the Google Play app.</p>

        <h2>7. Cookies</h2>
        <p>WalletLens itself does not set any first-party cookies beyond what is strictly necessary for the app to function. Third-party services described above may set their own cookies as described in their respective privacy policies. WalletLens does not serve advertising in the app.</p>

        <h2>8. Retention and Deletion</h2>
        <p>Records created by the optional features in section 3 are kept only while that feature is switched on. Turning a feature off in Settings deletes its stored record. Backup emails and AI requests are not retained after they are processed. To have everything associated with your device deleted, email the address in section 11 — no account is needed, and we will confirm once it is done.</p>

        <h2>9. Children's Privacy</h2>
        <p>WalletLens is not directed at children under the age of 13. We do not knowingly collect personal information from children.</p>

        <h2>10. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "last modified" date. Continued use of the app after changes constitutes acceptance of the revised policy.</p>

        <h2>11. Contact</h2>
        <p>If you have any questions about this Privacy Policy, please email us at <a href="mailto:contact@walletlens.live">contact@walletlens.live</a>.</p>
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/terms/">Terms of Service</Link>
        <Link to="/about/">About</Link>
        <Link to="/blog/">Blog</Link>
      </footer>
    </div>
  )
}
