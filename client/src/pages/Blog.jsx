import { Link, useParams } from 'react-router-dom'
import Logo from '../components/Logo'

const POSTS = [
  {
    slug: 'how-to-track-crypto-portfolio-free',
    title: 'How to Track Your Crypto Portfolio for Free in 2026',
    date: 'May 2026',
    readTime: '5 min read',
    summary: 'A complete guide to tracking Bitcoin, Ethereum, and altcoin holdings without paying for a subscription or giving up your private keys.',
    content: `
Managing a cryptocurrency portfolio across multiple exchanges and wallets is notoriously difficult. Prices change every second, you're tracking dozens of coins across Binance, Coinbase, and cold storage, and most tracking tools either cost money or require connecting your exchange API keys.

This guide shows you how to track your entire crypto portfolio for free — without an account, without subscriptions, and without trusting a third party with your financial data.

## The Problem With Most Crypto Trackers

Most popular crypto portfolio trackers like CoinTracker, CoinStats, and Delta have a common set of problems:

**They require an account.** Even for basic features, you must hand over your email address, creating a link between your identity and your crypto holdings.

**They charge for real features.** Free tiers are intentionally limited — historical data, tax reports, and multi-exchange syncing are locked behind $10–$30/month subscriptions.

**They connect to your exchanges.** Many trackers offer automatic sync by asking for your API keys. This introduces a security risk: if the tracker is breached, your keys could be exposed.

**They only track crypto.** If you also hold stocks, gold, or fiat savings, you need a separate app for each — making it impossible to see your complete financial picture.

## A Better Approach: Manual Entry with Local Storage

The most private and secure way to track your portfolio is manual entry with local-first storage. You enter your trades by hand (buy price, quantity, date), and the app calculates your P&L, allocation, and performance using live prices — but stores all that data only in your browser.

This is exactly how WalletLens works.

## Setting Up Your Portfolio in WalletLens

1. **Open [walletlens.cc](https://walletlens.cc)** in any modern browser. No installation, no account.

2. **Create a wallet** on the Dashboard. Name it after your exchange or storage type — e.g. "Binance", "Ledger", "MetaMask".

3. **Add your first trade.** Tap the Buy button, search for your coin (Bitcoin, Ethereum, Solana, or any of 10,000+ assets), enter the quantity and price you paid, and the date.

4. **Repeat for each holding.** If you've been dollar-cost averaging into Bitcoin over two years, add each purchase separately for accurate average cost tracking.

5. **Check your P&L.** The Dashboard shows your total portfolio value (live), all-time P&L in dollars and percentage, and a breakdown by asset.

## Reading the AI Analysis

Once you have at least two or three holdings, tap the **AI** tab on the Dashboard. WalletLens runs seven analyses entirely on your device:

- **Health Score** — a 0–100 rating of your portfolio's diversification and risk profile.
- **Fear & Greed Gauge** — composite sentiment from your portfolio's momentum, P&L ratio, and concentration.
- **Stress Test** — your portfolio value if the market drops 10%, 30%, or 60%, or rallies 50% or 200%.
- **Entry Quality** — whether you bought each asset above or below the current price.
- **Rebalance Planner** — what you'd need to buy or sell to reach equal-weight allocation.

## Setting Price Targets

The Sell Targets tab lets you plan your exit strategy. For each asset, set up to five price targets with a quantity to sell at each level. WalletLens shows a progress bar against the live price so you know exactly how close each target is.

For example, if you hold 1 BTC and plan to sell:
- 0.2 BTC at $120,000
- 0.3 BTC at $150,000
- 0.5 BTC at $200,000

WalletLens tracks each tier separately and shows the projected proceeds in real time.

## Backing Up Your Data

Since WalletLens stores data in your browser, clearing your browser storage would erase it. Use the **Export** feature on the Dashboard regularly. It generates a short WLZ code (a compressed text string) that you can save anywhere — a notes app, email draft, or password manager. To restore, paste the code into Import on any device.

## Conclusion

Tracking your crypto portfolio doesn't require paying a monthly fee, handing over API keys, or creating an account. WalletLens gives you live prices, AI analysis, sell planning, and whale tracking in one free, private, browser-based tool. Your data stays on your device.
    `
  },
  {
    slug: 'what-is-a-bitcoin-whale-transaction',
    title: 'What Is a Bitcoin Whale Transaction? (And Why It Matters)',
    date: 'May 2026',
    readTime: '4 min read',
    summary: 'Large Bitcoin transactions — often called "whale moves" — can signal shifts in market sentiment. Here\'s how to spot them and what they might mean for price.',
    content: `
In crypto markets, a "whale" refers to an entity — an individual, institution, or exchange — that holds such a large amount of Bitcoin that their transactions can visibly move the market. When a whale sends a large block of BTC, it often signals something significant: an exchange deposit before selling, a cold storage withdrawal before holding, or an OTC deal.

Understanding whale activity is one of the few on-chain signals available to retail investors that institutional traders also watch closely.

## What Counts as a Whale Transaction?

There's no universal threshold, but most analysts consider a Bitcoin transaction worth more than $500,000 to be whale-scale activity. WalletLens's Whale Tracker filters the Bitcoin mempool for unconfirmed transactions above this threshold in real time.

Transactions worth $10 million or more (sometimes called "mega whale" moves) attract the most attention, particularly when they involve known exchange wallets.

## How to Read Whale Transaction Direction

The direction of a whale move matters more than the size:

**Exchange inflows (wallet → exchange):** When a large amount of BTC moves *to* a known exchange wallet, it often precedes selling. Whales typically send coins to exchanges before liquidating. High exchange inflows during a price rally are a potential bearish signal.

**Exchange outflows (exchange → wallet):** The opposite — BTC moving *off* an exchange to a private wallet — usually indicates accumulation or long-term holding. This is generally a bullish signal, as it reduces the supply available for immediate sale.

**Wallet-to-wallet transfers:** These are harder to interpret. They could be internal consolidation, OTC deals, or simply reorganising cold storage.

## The WalletLens Whale Tracker

WalletLens fetches unconfirmed Bitcoin mempool data from blockchain.info and displays transactions above $500,000 in real time. Each entry shows:

- **BTC amount** — the raw coin quantity
- **USD value** — calculated using the live Bitcoin price
- **Time** — how long ago the transaction was broadcast
- **Transaction hash** — clickable link to blockchain.com for full on-chain details

Because it reads the mempool (transactions that haven't yet been confirmed in a block), you see whale moves as they happen — often minutes before they hit most analytics dashboards.

## Volume Anomalies and Smart Money

Beyond individual transactions, the Whale Tracker's **Volume Anomalies** tab flags coins with an unusually high volume-to-market-cap ratio. This metric (sometimes called "turnover ratio") can indicate that large players are actively accumulating or distributing a position.

A coin with $50M in daily volume but only $200M market cap has a 25% turnover — suggesting unusually heavy hands are involved.

## Should You Trade on Whale Signals?

Whale signals are one data point, not a complete strategy. Large transactions are often routine (exchange rebalancing, custodian transfers, miner payouts) and tell you nothing about intent. Use whale data as part of a broader analysis:

1. Check on-chain context — is the receiving address known?
2. Look at the broader market trend — is this a support test or a breakdown?
3. Watch for confirmation in price action — does the whale move coincide with a spike in sell pressure?

The Whale Tracker in WalletLens is designed to give you this raw signal quickly and clearly, so you can form your own view.
    `
  },
  {
    slug: 'fear-and-greed-index-crypto-explained',
    title: 'The Fear & Greed Index for Crypto: What It Is and How to Use It',
    date: 'May 2026',
    readTime: '4 min read',
    summary: 'The Fear & Greed Index is one of the most watched sentiment indicators in crypto. Learn what drives it, how to read it, and how WalletLens calculates a personalised version for your own portfolio.',
    content: `
"Be fearful when others are greedy, and greedy when others are fearful." Warren Buffett's famous maxim applies to crypto markets just as much as it does to stocks — arguably more so, given the emotional volatility of the space.

The Fear & Greed Index attempts to quantify where the market sits on that emotional spectrum at any given moment, giving investors an objective number to anchor their decisions.

## What Is the Fear & Greed Index?

The most widely followed crypto Fear & Greed Index (published by Alternative.me) produces a daily score from 0 to 100:

- **0–24: Extreme Fear** — Investors are panicking. Historically a potential buy signal.
- **25–49: Fear** — Market sentiment is negative but not extreme.
- **50: Neutral** — Neither fearful nor greedy.
- **51–74: Greed** — Investors are bullish and risk-on.
- **75–100: Extreme Greed** — Euphoria. Historically associated with market tops.

The score is calculated from six data sources: market volatility, market momentum/volume, social media sentiment, surveys, Bitcoin dominance, and Google Trends data for Bitcoin-related searches.

## How to Interpret the Score

The Fear & Greed Index is most useful as a **contrarian indicator**. Historically:

- Readings below 20 (extreme fear) have often coincided with major Bitcoin bottoms — March 2020 (COVID crash), November 2022 (FTX collapse).
- Readings above 80 (extreme greed) have often preceded short-term corrections — late 2017, early 2021.

This doesn't mean you should blindly buy at 15 or sell at 85. But it provides a useful gut-check: if you're feeling the urge to buy because "everything is going up and you're missing out," check the index. If it's at 85, you're probably not the first to notice.

## The WalletLens AI Fear & Greed Gauge

WalletLens calculates a **personalised** Fear & Greed score for your own portfolio — not the broad market. This is more actionable than the market-wide index because it reflects your actual exposure.

The on-device calculation combines four signals:

**1. Price momentum** — Are the assets in your portfolio trending up or down over the past 24 hours and 7 days? Strong positive momentum adds to Greed; negative momentum pushes toward Fear.

**2. P&L ratio** — What percentage of your holdings are in profit vs. loss? A portfolio where 80% of assets are in the green scores toward Greed; one where most positions are underwater scores toward Fear.

**3. Trade sentiment** — Looking at your transaction history, are you in a buying phase or a selling phase recently? Net buying pushes toward Greed; net selling toward Fear.

**4. Concentration risk** — A highly concentrated portfolio (e.g. 90% in a single asset) adds a small Greed component if that asset is up, or a Fear component if it's down — because your emotional exposure is amplified.

The resulting number appears on the AI tab as a live arc gauge with a needle, colour-coded from deep red (Extreme Fear) through yellow (Neutral) to deep green (Extreme Greed).

## Practical Uses

- **Rebalancing trigger:** If your personal gauge hits Extreme Greed (above 75), consider whether you should take some profit and rebalance toward your target allocation.
- **Buying opportunity check:** If it drops below 25, review which positions have the best entry quality (see the Entry Quality card) — the fear may be creating a buying opportunity.
- **Emotional circuit breaker:** When you feel the urge to make a panic sell or a FOMO buy, look at the gauge first. It forces a moment of data-driven reflection.
    `
  },
  {
    slug: 'portfolio-diversification-crypto-stocks-gold',
    title: 'How to Diversify Your Portfolio Across Crypto, Stocks, and Gold',
    date: 'May 2026',
    readTime: '6 min read',
    summary: 'Diversification across asset classes reduces risk without necessarily reducing returns. Here\'s a practical framework for balancing crypto, equities, and hard assets.',
    content: `
The single biggest mistake new investors make is concentrating their entire portfolio in one asset class — usually whatever has performed best recently. In 2021, that meant all-in on crypto. In 2022, that strategy wiped out many portfolios by 70–90%.

Diversification doesn't mean you can't have conviction plays. It means structuring your portfolio so that no single bad outcome destroys everything you've built.

## Why Diversify Across Asset Classes?

Different asset classes have different return drivers and risk profiles:

**Cryptocurrencies** — High volatility, high potential return, low correlation to traditional markets (though this correlation increases during broad risk-off events). Bitcoin and Ethereum behave differently to altcoins; large-cap crypto is more stable than small-cap.

**US Stocks** — Long-term wealth builders driven by corporate earnings growth. Individual stocks are volatile; index funds (S&P 500, NASDAQ) are more stable. Dividends provide income.

**Gold and Silver** — Traditional stores of value and inflation hedges. Gold has a 5,000-year track record as money. Silver has additional industrial demand. Both tend to perform well when real interest rates are negative or when currency debasement is a concern.

**Bonds** — Fixed income, capital preservation. Lower returns than equities but provide stability and income. Government bonds have historically been inversely correlated with stocks during risk-off events.

**Fiat / Cash** — Provides optionality — the ability to buy when others are selling. In a high-interest-rate environment, cash earns meaningful yield. Always keep some dry powder.

## A Practical Framework

There is no universally correct allocation. Your ideal split depends on your age, income stability, risk tolerance, and investment horizon. But here are some reference frameworks:

**Aggressive (25–35 years old, high risk tolerance):**
- 50–60% crypto (split between BTC, ETH, and selective altcoins)
- 25–30% stocks (growth-focused)
- 10–15% gold/silver
- 5% cash

**Moderate (35–50 years old, medium risk tolerance):**
- 25–35% crypto (mostly BTC and ETH)
- 35–45% stocks (mix of growth and dividend)
- 15–20% gold
- 5–10% bonds
- 5% cash

**Conservative (50+ years old, capital preservation focus):**
- 10–15% crypto (Bitcoin only)
- 30–40% stocks (dividend-focused)
- 20–25% gold
- 20–25% bonds
- 5–10% cash

## The Market Cap Tier Question Within Crypto

Within your crypto allocation, diversification across market cap tiers matters enormously. WalletLens classifies holdings into five tiers:

- **Mega cap** (Bitcoin, Ethereum) — Most liquid, most institutional ownership, lowest relative volatility within crypto.
- **Large cap** (BNB, SOL, XRP, etc.) — Established projects with real usage, more volatile than mega cap.
- **Mid cap** — Growing ecosystems, higher risk and potential reward.
- **Small cap** — Speculative, high volatility, can 10x or go to zero.
- **Micro cap** — Highly speculative. Only for capital you can afford to lose entirely.

The AI tab in WalletLens shows you exactly how your crypto holdings are split across these tiers with a radar chart, making it easy to spot if you're over-concentrated in speculative assets.

## Rebalancing

Diversification only works if you maintain your target allocation over time. As assets move, your portfolio drifts. If crypto runs 200% in a bull market, it may grow from 30% to 60% of your portfolio — now you're twice as exposed to the next crypto crash as you planned to be.

The WalletLens Rebalance Planner (in the AI tab) calculates exactly how many dollars to buy or sell per asset to return to equal-weight allocation. Run it quarterly or after any major market move.

## Tracking a Multi-Asset Portfolio

Most portfolio trackers only cover one asset class. WalletLens was specifically built to track crypto, stocks, gold, silver, bonds, and fiat currencies in a single unified dashboard with live prices — giving you a complete picture of your total net worth across every asset class.
    `
  },
  {
    slug: 'how-to-set-crypto-profit-targets',
    title: 'How to Set Crypto Profit Targets (And Actually Stick to Them)',
    date: 'May 2026',
    readTime: '5 min read',
    summary: 'Most crypto investors buy well but sell poorly — either too early or, more often, too late. A systematic profit-taking plan removes emotion from the decision.',
    content: `
Buying crypto at the right time is hard. But selling is harder. The psychological challenge of watching an asset you sold at $50,000 run to $100,000 is often worse than holding through a crash. And yet holding all the way through a bear market — because you never had a plan to take profit — destroys far more wealth.

A systematic profit-taking strategy, defined before you buy, removes the emotion. You know in advance at what price you're selling, how much, and why.

## The Problem With "I'll Know When to Sell"

Euphoria distorts judgement. When Bitcoin is at $120,000 and everyone is predicting $500,000, it feels irrational to sell. Social media reinforces the bullish narrative; holding feels like the smart move. The same thing happens in reverse — during a crash, everything feels like it will go to zero, and selling at the worst point feels logical.

A profit-taking plan anchors your decisions to pre-determined numbers rather than to the current emotional climate. It's a contract you make with your more rational, present self — to be honoured by your future, emotional self.

## The Multi-Target Approach

Instead of picking a single sell price, define three to five price targets at different levels. At each target, sell a portion of your position. This approach:

- Guarantees you capture some profit if the asset reaches only moderate gains.
- Leaves upside exposure if the asset continues to run.
- Prevents the all-or-nothing psychology that leads to holding to the top and then all the way back down.

**Example: 1 BTC position, purchased at $60,000**

| Target | BTC to Sell | Cumulative Sold | Remaining |
|--------|-------------|-----------------|-----------|
| $90,000 | 0.15 BTC | 0.15 BTC | 0.85 BTC |
| $120,000 | 0.20 BTC | 0.35 BTC | 0.65 BTC |
| $150,000 | 0.20 BTC | 0.55 BTC | 0.45 BTC |
| $200,000 | 0.25 BTC | 0.80 BTC | 0.20 BTC |
| $300,000 | 0.20 BTC | 1.00 BTC | 0.00 BTC |

If Bitcoin peaks at $150,000 and then crashes back, you've locked in profit on 55% of your position — regardless of how the last 45% performs.

## Setting Up Targets in WalletLens

The **Sell Targets** tab on the WalletLens Dashboard makes this process concrete:

1. Select an asset from your portfolio.
2. Add a target — price, quantity to sell, optional notes.
3. Add up to five targets per asset.
4. WalletLens shows a progress bar against the live price, and calculates projected proceeds at each level.

As Bitcoin approaches your first target, the progress bar fills up — giving you a visual reminder that your plan is in play without requiring you to constantly check prices.

## What to Do with Proceeds

Define where profits go before you take them. Common strategies:

**Re-allocate within crypto:** Take profit from an altcoin into Bitcoin or Ethereum, which have lower relative volatility. This lets you stay in the space while reducing risk.

**Rotate into other asset classes:** Move some profit into gold, stocks, or bonds to rebalance your overall allocation.

**Keep cash:** Uninvested capital is optionality. In a bear market, cash lets you buy at lower prices.

**Dollar-cost average back in:** After selling at a target, set a DCA plan to re-enter at a predetermined lower price if the market pulls back.

## The Tax Consideration

In most jurisdictions, selling crypto is a taxable event. Factor your tax rate into your target calculations — a 30% capital gains tax means you need to sell 43% more to net the same after-tax amount. Consult a tax professional for your specific situation.

WalletLens does not currently generate tax reports, but tracking every trade accurately in the Transactions log makes it easy to export data for tax purposes.

## Conclusion

Profit targets don't remove all the difficulty of selling — you'll still feel the sting if an asset runs past your final target. But they ensure that no matter what happens, you come away with something. In crypto, where 80–90% drawdowns are routine, "coming away with something" beats holding to zero every time.
    `
  },
]

function PostCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card-meta">{post.date} · {post.readTime}</div>
      <h2 className="blog-card-title">{post.title}</h2>
      <p className="blog-card-summary">{post.summary}</p>
      <span className="blog-card-cta">Read article →</span>
    </Link>
  )
}

function renderMarkdown(text) {
  const lines = text.trim().split('\n')
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      result.push(<h2 key={i}>{line.slice(3)}</h2>)
    } else if (line.startsWith('**') && line.endsWith('**')) {
      result.push(<p key={i}><strong>{line.slice(2, -2)}</strong></p>)
    } else if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        const raw = lines[i].slice(2)
        const parts = raw.split(/\*\*([^*]+)\*\*/)
        items.push(<li key={i}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}</li>)
        i++
      }
      result.push(<ul key={'ul' + i}>{items}</ul>)
      continue
    } else if (line.startsWith('| ')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('| ')) {
        if (!lines[i].includes('---')) {
          const cells = lines[i].split('|').filter(c => c.trim())
          rows.push(cells)
        }
        i++
      }
      result.push(
        <table key={'tbl' + i} className="blog-table">
          <thead><tr>{rows[0].map((c, j) => <th key={j}>{c.trim()}</th>)}</tr></thead>
          <tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{c.trim()}</td>)}</tr>)}</tbody>
        </table>
      )
      continue
    } else if (line.trim() !== '') {
      const parts = line.split(/\*\*([^*]+)\*\*/)
      result.push(<p key={i}>{parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}</p>)
    }
    i++
  }
  return result
}

export default function Blog() {
  const { slug } = useParams()
  const post = slug ? POSTS.find(p => p.slug === slug) : null

  if (slug && !post) {
    return (
      <div className="doc-page">
        <header className="doc-header"><Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link></header>
        <article className="doc-article"><h1>Post not found</h1><Link to="/blog">← Back to Blog</Link></article>
      </div>
    )
  }

  if (post) {
    return (
      <div className="doc-page">
        <header className="doc-header"><Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link></header>
        <article className="doc-article">
          <Link to="/blog" className="blog-back">← All Articles</Link>
          <p className="doc-meta">{post.date} · {post.readTime}</p>
          <h1>{post.title}</h1>
          <p className="blog-summary">{post.summary}</p>
          <hr className="blog-divider" />
          {renderMarkdown(post.content)}
          <hr className="blog-divider" />
          <div className="blog-cta-box">
            <strong>Start tracking your portfolio for free</strong>
            <p>WalletLens is 100% free, no account required, and all your data stays on your device.</p>
            <Link to="/dashboard" className="blog-cta-btn">Open WalletLens →</Link>
          </div>
        </article>
        <footer className="doc-footer">
          <Link to="/blog">← All Articles</Link>
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </footer>
      </div>
    )
  }

  return (
    <div className="doc-page">
      <header className="doc-header"><Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link></header>
      <div className="doc-article">
        <h1>WalletLens Blog</h1>
        <p className="doc-meta">Guides and insights on portfolio tracking, crypto investing, and market analysis.</p>
        <div className="blog-grid">
          {POSTS.map(p => <PostCard key={p.slug} post={p} />)}
        </div>
      </div>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/about">About</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  )
}
