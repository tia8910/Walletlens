import { useEffect, useState, useCallback } from 'react'
import { track } from '../analytics'

// RSS sources fetched via rss2json (free, no auth, CORS-friendly)
const RSS_FEEDS = [
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', color: '#f7931a' },
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#1a9fff' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed', color: '#6b21a8' },
]
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?count=40&rss_url='

// Map CoinGecko IDs → search keywords for article filtering
const COIN_KEYWORDS = {
  bitcoin:         ['bitcoin', 'btc'],
  ethereum:        ['ethereum', 'eth'],
  solana:          ['solana', 'sol'],
  binancecoin:     ['binance', 'bnb'],
  xrp:             ['xrp', 'ripple'],
  cardano:         ['cardano', 'ada'],
  dogecoin:        ['dogecoin', 'doge'],
  'avalanche-2':   ['avalanche', 'avax'],
  polkadot:        ['polkadot', 'dot'],
  chainlink:       ['chainlink', 'link'],
  polygon:         ['polygon', 'matic'],
  litecoin:        ['litecoin', 'ltc'],
  tron:            ['tron', 'trx'],
  'shiba-inu':     ['shiba', 'shib'],
  'uniswap':       ['uniswap', 'uni'],
  'cosmos':        ['cosmos', 'atom'],
  'near':          ['near protocol', 'near'],
  'aptos':         ['aptos', 'apt'],
  'arbitrum':      ['arbitrum', 'arb'],
  'optimism':      ['optimism', 'op'],
  'sui':           ['sui'],
  'pepe':          ['pepe'],
  'render-token':  ['render', 'rndr'],
  'injective-protocol': ['injective', 'inj'],
}

function getKeywords(coinId, coinName, symbol) {
  const preset = COIN_KEYWORDS[coinId] || []
  const extras = [
    coinName?.toLowerCase(),
    symbol?.toLowerCase(),
  ].filter(Boolean)
  return [...new Set([...preset, ...extras])]
}

function articleMatchesCoins(article, coinKeywordMap) {
  const haystack = (
    (article.title || '') + ' ' + (article.description || '') + ' ' + (article.categories?.join(' ') || '')
  ).toLowerCase()
  for (const keywords of Object.values(coinKeywordMap)) {
    if (keywords.some(kw => haystack.includes(kw))) return true
  }
  return false
}

function timeAgo(pubDate) {
  const diff = Date.now() - new Date(pubDate).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/gi, ' ').trim()
}

function NewsCard({ article, source, matchedCoins }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card"
      onClick={() => track('news_article_click', { source, title: article.title?.slice(0, 60) })}
    >
      {article.thumbnail && (
        <div className="news-card-thumb">
          <img src={article.thumbnail} alt="" onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div className="news-card-body">
        <div className="news-card-meta">
          <span className="news-source-tag" style={{ color: source.color }}>{source.name}</span>
          <span className="news-card-time">{timeAgo(article.pubDate)}</span>
        </div>
        <div className="news-card-title">{article.title}</div>
        {matchedCoins.length > 0 && (
          <div className="news-coin-tags">
            {matchedCoins.map(c => (
              <span key={c} className="news-coin-tag">{c.toUpperCase()}</span>
            ))}
          </div>
        )}
        <div className="news-card-desc">{stripHtml(article.description).slice(0, 120)}…</div>
      </div>
    </a>
  )
}

export default function NewsFeed({ enriched = [] }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [filter, setFilter]     = useState('my-coins') // 'my-coins' | 'all'
  const [lastFetch, setLastFetch] = useState(null)

  // Build keyword map from user's holdings
  const coinKeywordMap = {}
  for (const h of enriched) {
    if (!h.coin_id) continue
    coinKeywordMap[h.coin_id] = getKeywords(h.coin_id, h.name, h.symbol)
  }
  const hasHoldings = enriched.length > 0

  const fetchNews = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const results = await Promise.allSettled(
        RSS_FEEDS.map(feed =>
          fetch(RSS2JSON + encodeURIComponent(feed.url))
            .then(r => r.json())
            .then(data => ({ feed, items: data.items || [] }))
        )
      )
      const all = []
      for (const r of results) {
        if (r.status === 'fulfilled') {
          for (const item of r.value.items) {
            all.push({ ...item, _source: r.value.feed })
          }
        }
      }
      // Sort by date descending, deduplicate by title
      const seen = new Set()
      const deduped = all
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .filter(a => {
          const key = a.title?.slice(0, 60)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      setArticles(deduped)
      setLastFetch(Date.now())
    } catch (e) {
      setError('Could not load news. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNews()
    track('news_feed_view')
  }, [fetchNews])

  // Filter articles
  const displayed = articles.filter(a => {
    if (filter === 'all' || !hasHoldings) return true
    return articleMatchesCoins(a, coinKeywordMap)
  })

  // Compute matched coins per article
  function getMatchedCoins(article) {
    const haystack = (
      (article.title || '') + ' ' + (article.description || '')
    ).toLowerCase()
    return enriched
      .filter(h => {
        const kws = coinKeywordMap[h.coin_id] || []
        return kws.some(kw => haystack.includes(kw))
      })
      .map(h => h.symbol || h.coin_id)
      .slice(0, 3)
  }

  return (
    <div className="news-feed-wrap">
      {/* Header */}
      <div className="news-feed-header">
        <div className="news-feed-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
            <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
          </svg>
          Crypto News
        </div>
        <div className="news-feed-controls">
          {hasHoldings && (
            <div className="news-filter-pills">
              <button
                className={`news-filter-pill ${filter === 'my-coins' ? 'active' : ''}`}
                onClick={() => { setFilter('my-coins'); track('news_filter', { filter: 'my-coins' }) }}
              >My Coins</button>
              <button
                className={`news-filter-pill ${filter === 'all' ? 'active' : ''}`}
                onClick={() => { setFilter('all'); track('news_filter', { filter: 'all' }) }}
              >All</button>
            </div>
          )}
          <button className="news-refresh-btn" onClick={fetchNews} disabled={loading} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: loading ? 'news-spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </div>

      {lastFetch && (
        <div className="news-last-updated">
          Updated {timeAgo(lastFetch)} · {displayed.length} articles
          {hasHoldings && filter === 'my-coins' && ` about your ${enriched.length} coins`}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="news-skeleton-list">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="news-skeleton-card">
              <div className="news-skeleton-thumb" />
              <div className="news-skeleton-lines">
                <div className="news-skel-line" style={{ width: '30%', height: 10 }} />
                <div className="news-skel-line" style={{ width: '90%', height: 16 }} />
                <div className="news-skel-line" style={{ width: '70%', height: 16 }} />
                <div className="news-skel-line" style={{ width: '80%', height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="news-error">
          <span>{error}</span>
          <button onClick={fetchNews}>Retry</button>
        </div>
      )}

      {!loading && !error && displayed.length === 0 && (
        <div className="news-empty">
          {hasHoldings && filter === 'my-coins'
            ? 'No recent news found for your coins. Try switching to All.'
            : 'No articles loaded.'}
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="news-card-list">
          {displayed.map((article, i) => (
            <NewsCard
              key={i}
              article={article}
              source={article._source}
              matchedCoins={getMatchedCoins(article)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
