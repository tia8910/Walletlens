import { Link } from 'react-router-dom'
import Logo from '../components/Logo'

export default function Terms() {
  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>Terms of Service</h1>
        <p className="doc-meta">Last updated: May 2026</p>

        <p>Please read these Terms of Service ("Terms") carefully before using WalletLens ("the app", "we", "our"). By accessing or using WalletLens, you agree to be bound by these Terms.</p>

        <h2>1. Description of Service</h2>
        <p>WalletLens is a free, browser-based portfolio tracking application that allows users to record and monitor investments across multiple asset classes including cryptocurrencies, equities, commodities, and fiat currencies. The app runs entirely in your browser; no server stores your financial data.</p>

        <h2>2. Eligibility</h2>
        <p>You must be at least 13 years old to use WalletLens. By using the app, you represent that you meet this age requirement. If you are under 18, you should review these Terms with a parent or guardian.</p>

        <h2>3. No Financial Advice</h2>
        <p>WalletLens is an informational tool only. Nothing on the platform constitutes financial, investment, legal, or tax advice. All data, AI-generated insights, price alerts, risk scores, and portfolio analyses are provided for informational purposes only and should not be relied upon to make investment decisions.</p>
        <p>Always do your own research and consult a qualified financial adviser before making any investment decisions. Past performance indicators shown in the app do not guarantee future results.</p>

        <h2>4. Data Accuracy</h2>
        <p>Price data is sourced from third-party APIs (CoinGecko, Binance, CoinCap, Gold-API, Stooq, and others). WalletLens does not guarantee the accuracy, completeness, timeliness, or fitness for any purpose of any price or market data displayed. We are not responsible for any loss arising from reliance on this data.</p>

        <h2>5. Your Data</h2>
        <p>All portfolio data you enter is stored locally in your browser's <code>localStorage</code>. We have no access to it. You are solely responsible for maintaining backups of your data using the app's export feature. Clearing your browser data, using a new device, or uninstalling the app will permanently delete your local data unless you have exported a backup.</p>

        <h2>6. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the app for any unlawful purpose or in violation of any applicable law or regulation</li>
          <li>Attempt to reverse-engineer, decompile, or disassemble any part of the app</li>
          <li>Use automated tools to scrape, overload, or abuse third-party APIs accessed through the app</li>
          <li>Misrepresent portfolio data or use the app to facilitate financial fraud</li>
        </ul>

        <h2>7. Intellectual Property</h2>
        <p>The WalletLens name, logo, interface design, and original code are the property of WalletLens. Third-party cryptocurrency logos and brand assets belong to their respective owners and are used under fair-use principles for identification purposes.</p>

        <h2>8. Third-Party Services</h2>
        <p>WalletLens integrates with third-party services for price data, analytics (Google Analytics), and advertising (Google AdSense). Your use of the app is also subject to the terms and privacy policies of these third parties. We are not responsible for the practices of third-party services.</p>

        <h2>9. Disclaimer of Warranties</h2>
        <p>WalletLens is provided "as is" and "as available" without warranties of any kind, express or implied. We do not warrant that the app will be uninterrupted, error-free, or free of viruses. To the fullest extent permitted by applicable law, we disclaim all warranties including implied warranties of merchantability and fitness for a particular purpose.</p>

        <h2>10. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, WalletLens and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or investment value, arising from your use of or inability to use the app.</p>

        <h2>11. Modifications to the Service</h2>
        <p>We reserve the right to modify, suspend, or discontinue any aspect of WalletLens at any time without notice. We will not be liable to you or any third party for any modification, suspension, or discontinuation.</p>

        <h2>12. Changes to These Terms</h2>
        <p>We may update these Terms from time to time. Changes will be posted on this page with an updated "last modified" date. Continued use of the app after any changes constitutes acceptance of the revised Terms.</p>

        <h2>13. Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with applicable law. Any disputes arising from these Terms or your use of the app shall be resolved through good-faith negotiation or, if necessary, binding arbitration.</p>

        <h2>14. Contact</h2>
        <p>If you have any questions about these Terms, please open an issue on our <a href="https://github.com/tia8910/walletlens" target="_blank" rel="noreferrer">GitHub repository</a>.</p>
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/privacy">Privacy Policy</Link>
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
