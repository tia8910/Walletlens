import { useEffect, useState, useCallback } from 'react'
import { track } from '../analytics'

const RSS_FEEDS = [
  { name: 'CoinTelegraph',    url: 'https://cointelegraph.com/rss',                   color: '#f7931a' },
  { name: 'CoinDesk',         url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#1a9fff' },
  { name: 'Decrypt',          url: 'https://decrypt.co/feed',                         color: '#6b21a8' },
  { name: 'Bitcoin Magazine',  url: 'https://bitcoinmagazine.com/feed',               color: '#ff9900' },
]

const COIN_KEYWORDS = {
  bitcoin:              ['bitcoin', 'btc'],
  ethereum:             ['ethereum', 'eth'],
  solana:               ['solana', 'sol'],
  binancecoin:          ['binance', 'bnb'],
  xrp:                  ['xrp', 'ripple'],
  cardano:              ['cardano', 'ada'],
  dogecoin:             ['dogecoin', 'doge'],
  'avalanche-2':        ['avalanche', 'avax'],
  polkadot:             ['polkadot', 'dot'],
  chainlink:            ['chainlink', 'link'],
  polygon:              ['polygon', 'matic'],
  litecoin:             ['litecoin', 'ltc'],
  tron:                 ['tron', 'trx'],
  'shiba-inu':          ['shiba', 'shib'],
  uniswap:              ['uniswap', 'uni'],
  cosmos:               ['cosmos', 'atom'],
  near:                 ['near protocol', 'near'],
  aptos:                ['aptos', 'apt'],
  arbitrum:             ['arbitrum', 'arb'],
  optimism:             ['optimism'],
  sui:                  ['sui'],
  pepe:                 ['pepe'],
  'render-token':       ['render', 'rndr'],
  'injective-protocol': ['injective', 'inj'],
}

function getKeywords(coinId, coinName, symbol) {
  const preset = COIN_KEYWORDS[coinId] || []
  const extras = [coinName?.toLowerCase(), symbol?.toLowerCase()].filter(Boolean)
  return [...new Set([...preset, ...extras])]
}

function articleMatchesCoins(article, coinKeywordMap) {
  const haystack = ((article.title || '') + ' ' + (article.description || '')).toLowerCase()
  for (const keywords of Object.values(coinKeywordMap)) {
    if (keywords.some(kw => haystack.includes(kw))) return true
  }
  return false
}

function timeAgo(pubDate) {
  if (!pubDate) return ''
  const diff = Date.now() - new Date(pubDate).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Manual timeout wrapper (AbortSignal.timeout not available on all mobile browsers)
function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id))
}

function parseRssXml(xmlText, feed) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')
    const items = Array.from(doc.querySelectorAll('item'))
    return items.slice(0, 25).map(item => {
      const get = tag => item.querySelector(tag)?.textContent?.trim() || ''

      let thumbnail = ''
      const mc = item.querySelector('content')
      if (mc) thumbnail = mc.getAttribute('url') || ''
      if (!thumbnail) {
        const enc = item.querySelector('enclosure')
        if (enc) thumbnail = enc.getAttribute('url') || ''
      }
      if (!thumbnail) {
        const m = get('description').match(/<img[^>]+src=["']([^"']+)["']/i)
        if (m) thumbnail = m[1]
      }

      const rawDesc = get('description')
      const desc = rawDesc.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

      return {
        title:       get('title'),
        link:        get('link') || '',
        description: desc.slice(0, 300),
        pubDate:     get('pubDate'),
        thumbnail,
        source:      feed.name,
        sourceColor: feed.color,
      }
    }).filter(a => a.title && a.link)
  } catch {
    return []
  }
}

// Try corsproxy.io first (returns raw content, more reliable)
// Fall back to allorigins.win (returns JSON wrapper)
async function fetchFeed(feed) {
  // Primary: corsproxy.io
  try {
    const res = await fetchWithTimeout('https://corsproxy.io/?' + encodeURIComponent(feed.url), 10000)
    if (res.ok) {
      const xml = await res.text()
      const items = parseRssXml(xml, feed)
      if (items.length) return items
    }
  } catch { /* try next */ }

  // Fallback: allorigins.win
  const res = await fetchWithTimeout('https://api.allorigins.win/get?url=' + encodeURIComponent(feed.url), 12000)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json.contents) throw new Error('empty')
  return parseRssXml(json.contents, feed)
}

function NewsCard({ article, matchedCoins }) {
  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="news-card"
      onClick={() => track('news_article_click', { source: article.source, title: article.title?.slice(0, 60) })}
    >
      {article.thumbnail && (
        <div className="news-card-thumb">
          <img src={article.thumbnail} alt="" onError={e => { e.target.style.display = 'none' }} />
        </div>
      )}
      <div className="news-card-body">
        <div className="news-card-meta">
          <span className="news-source-tag" style={{ color: article.sourceColor }}>{article.source}</span>
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
        {article.description && (
          <div className="news-card-desc">{article.description.slice(0, 120)}…</div>
        )}
      </div>
    </a>
  )
}

export default function NewsFeed({ enriched = [] }) {
  const [articles, setArticles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [filter, setFilter]       = useState('my-coins')
  const [lastFetch, setLastFetch] = useState(null)

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
      let items = []

      // 1. Try GitHub Actions cached /news.json (fastest, no CORS)
      try {
        const res = await fetchWithTimeout('/news.json?t=' + Math.floor(Date.now() / 3600000), 5000)
        if (res.ok) {
          const data = await res.json()
          if (data.articles?.length) items = data.articles
        }
      } catch { /* not deployed yet */ }

      // 2. Live RSS via CORS proxy
      if (!items.length) {
        const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed))
        for (const r of results) {
          if (r.status === 'fulfilled') items.push(...r.value)
        }
      }

      if (!items.length) throw new Error('no articles')

      const seen = new Set()
      const deduped = items
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .filter(a => {
          const key = a.title?.slice(0, 60)
          if (!key || seen.has(key)) return false
          seen.add(key)
          return true
        })

      setArticles(deduped)
      setLastFetch(Date.now())
    } catch {
      setError('Could not load news. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNews()
    track('news_feed_view')
  }, [fetchNews])

  const displayed = articles.filter(a => {
    if (filter === 'all' || !hasHoldings) return true
    return articleMatchesCoins(a, coinKeywordMap)
  })

  function getMatchedCoins(article) {
    const haystack = ((article.title || '') + ' ' + (article.description || '')).toLowerCase()
    return enriched
      .filter(h => (coinKeywordMap[h.coin_id] || []).some(kw => haystack.includes(kw)))
      .map(h => h.symbol || h.coin_id)
      .slice(0, 3)
  }

  return (
    <div className="news-feed-wrap">
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
            ? 'No recent news for your coins. Try switching to All.'
            : 'No articles loaded.'}
        </div>
      )}

      {!loading && !error && displayed.length > 0 && (
        <div className="news-card-list">
          {displayed.map((article, i) => (
            <NewsCard key={i} article={article} matchedCoins={getMatchedCoins(article)} />
          ))}
        </div>
      )}
    </div>
  )
}
