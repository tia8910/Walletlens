import { useEffect, useState, useRef, useMemo } from 'react'
import { track } from '../analytics'

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

// News is grouped by category. Crypto additionally has a cached /news.json
// (built by a scheduled job); stocks & economy pull live RSS via CORS proxy.
const FEED_GROUPS = {
  crypto: [
    { name: 'CoinTelegraph',    url: 'https://cointelegraph.com/rss',                   color: '#f7931a' },
    { name: 'CoinDesk',         url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#1a9fff' },
    { name: 'Decrypt',          url: 'https://decrypt.co/feed',                         color: '#6b21a8' },
    { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed',                color: '#ff9900' },
  ],
  stocks: [
    { name: 'MarketWatch',  url: 'https://feeds.marketwatch.com/marketwatch/topstories/', color: '#00a99d' },
    { name: 'CNBC Markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',  color: '#005594' },
    { name: 'Investing',    url: 'https://www.investing.com/rss/news_25.rss',             color: '#d4af37' },
    { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex',              color: '#6001d2' },
  ],
  economy: [
    { name: 'MarketWatch',  url: 'https://feeds.marketwatch.com/marketwatch/economy-politics/', color: '#00a99d' },
    { name: 'CNBC Economy', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',        color: '#005594' },
    { name: 'Investing',    url: 'https://www.investing.com/rss/news_14.rss',                    color: '#d4af37' },
  ],
}
const CATEGORIES = [
  { id: 'crypto',  label: 'Crypto' },
  { id: 'stocks',  label: 'Stocks' },
  { id: 'economy', label: 'Economy' },
]
// Kept for any external importers — crypto remains the default feed set.
const RSS_FEEDS = FEED_GROUPS.crypto

function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id))
}

function parseRssXml(xmlText, feed) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')
    return Array.from(doc.querySelectorAll('item')).slice(0, 15).map(item => {
      const get = tag => item.querySelector(tag)?.textContent?.trim() || ''
      // Strip HTML tags/entities from RSS descriptions so they read cleanly.
      const desc = get('description').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim()
      return {
        title:       get('title'),
        link:        get('link') || '',
        pubDate:     get('pubDate'),
        description: desc,
        source:      feed.name,
        sourceColor: feed.color,
      }
    }).filter(a => a.title && a.link)
  } catch { return [] }
}

// rss2json returns already-parsed JSON with CORS headers — the most reliable
// in-browser path, especially for non-crypto feeds (MarketWatch, CNBC, …).
function parseRss2json(json, feed) {
  if (!json || json.status !== 'ok' || !Array.isArray(json.items)) return []
  return json.items.slice(0, 15).map(it => ({
    title:       (it.title || '').trim(),
    link:        it.link || '',
    pubDate:     it.pubDate || '',
    description: (it.description || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim(),
    source:      feed.name,
    sourceColor: feed.color,
  })).filter(a => a.title && a.link)
}

async function fetchFeed(feed) {
  // 1. rss2json (clean JSON, CORS-enabled)
  try {
    const res = await fetchWithTimeout('https://api.rss2json.com/v1/api.json?count=15&rss_url=' + encodeURIComponent(feed.url), 10000)
    if (res.ok) {
      const items = parseRss2json(await res.json(), feed)
      if (items.length) return items
    }
  } catch { /* try proxies */ }
  // 2. corsproxy.io (raw XML)
  try {
    const res = await fetchWithTimeout('https://corsproxy.io/?url=' + encodeURIComponent(feed.url), 10000)
    if (res.ok) {
      const items = parseRssXml(await res.text(), feed)
      if (items.length) return items
    }
  } catch { /* try fallback */ }
  // 3. allorigins (raw XML wrapped in JSON)
  const res = await fetchWithTimeout('https://api.allorigins.win/get?url=' + encodeURIComponent(feed.url), 12000)
  if (!res.ok) throw new Error('failed')
  const json = await res.json()
  return parseRssXml(json.contents || '', feed)
}

export default function NewsTicker() {
  const [items, setItems]     = useState([])
  const [paused, setPaused]   = useState(false)
  const [category, setCategory] = useState('crypto')
  const [loading, setLoading] = useState(true)
  const trackRef              = useRef(null)
  const animRef               = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Crypto has a cached /news.json (fastest, no CORS). Other categories
      // pull live RSS via the CORS proxy.
      if (category === 'crypto') {
        try {
          const res = await fetchWithTimeout('/news.json?t=' + Math.floor(Date.now() / 3600000), 5000)
          if (res.ok) {
            const data = await res.json()
            if (data.articles?.length && !cancelled) {
              setItems(data.articles.slice(0, 40))
              return
            }
          }
        } catch { /* fall through */ }
      }

      // Live RSS for the selected category
      const feeds = FEED_GROUPS[category] || FEED_GROUPS.crypto
      const results = await Promise.allSettled(feeds.map(fetchFeed))
      if (cancelled) return
      const all = []
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value)
      }
      // Deduplicate + sort newest-first
      const seen = new Set()
      const deduped = all
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .filter(a => {
          const k = a.title?.slice(0, 50)
          if (!k || seen.has(k)) return false
          seen.add(k)
          return true
        })
      if (!cancelled) setItems(deduped)
    }

    setItems([])
    setLoading(true)
    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [category])

  const [modalOpen, setModalOpen] = useState(false)

  const doubled = useMemo(() => [...items, ...items], [items])
  const catLabel = CATEGORIES.find(c => c.id === category)?.label || 'Crypto'

  // Keep the component mounted while the modal is open even if the current
  // category is still loading / returned nothing, so switching categories
  // doesn't tear the modal down.
  if (!items.length && !modalOpen) return null

  return (
    <>
    {modalOpen && (
      <div className="news-modal-overlay" onClick={() => setModalOpen(false)}>
        <div className="news-modal" onClick={e => e.stopPropagation()}>
          <div className="news-modal-header">
            <span className="news-modal-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
                <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
              </svg>
              {catLabel} News{items.length ? ` · ${items.length} articles` : ''}
            </span>
            <button className="news-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
            </button>
          </div>
          <div className="news-modal-tabs">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                className={`news-modal-tab ${category === c.id ? 'active' : ''}`}
                onClick={() => { setCategory(c.id); track('news_category', { category: c.id }) }}
              >{c.label}</button>
            ))}
          </div>
          <div className="news-modal-list">
            {!items.length && (
              <div className="news-modal-empty">
                {loading
                  ? `Loading ${catLabel.toLowerCase()} news…`
                  : `No ${catLabel.toLowerCase()} news available right now. Try again shortly.`}
              </div>
            )}
            {items.map((item, i) => (
              <div key={i} className="news-modal-card">
                <div className="news-modal-card-meta">
                  <span className="news-source-tag" style={{ color: item.sourceColor }}>{item.source}</span>
                  <span className="news-card-time">{timeAgo(item.pubDate)}</span>
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-modal-card-title"
                  onClick={() => track('news_modal_click', { source: item.source })}
                >{item.title}</a>
                {item.description && (
                  <p className="news-modal-card-desc">{item.description.slice(0, 150)}…</p>
                )}
                <button
                  className="news-modal-share-btn"
                  onClick={() => {
                    const text = encodeURIComponent(`${item.title} — via walletlens.live`)
                    const url  = encodeURIComponent(item.link)
                    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener')
                    track('news_modal_share', { source: item.source })
                  }}
                >𝕏 Share</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    <div
      className="news-ticker-wrap"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <span className="news-ticker-label">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
        LIVE
      </span>
      <div className="news-ticker-mask">
        <div
          className="news-ticker-track"
          style={{ animationPlayState: paused ? 'paused' : 'running' }}
          ref={trackRef}
        >
          {doubled.map((item, i) => (
            <span key={i} className="news-ticker-item">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="news-ticker-link"
                onClick={() => track('news_ticker_click', { source: item.source, title: item.title?.slice(0, 60) })}
              >
                <span className="news-ticker-source" style={{ color: item.sourceColor }}>{item.source}</span>
                <span className="news-ticker-title">{item.title}</span>
              </a>
              <button
                className="news-ticker-share"
                title="Share on X"
                onClick={e => {
                  e.stopPropagation()
                  const text = encodeURIComponent(`${item.title} — via walletlens.live`)
                  const url  = encodeURIComponent(item.link)
                  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener')
                  track('news_ticker_share', { source: item.source, title: item.title?.slice(0, 60) })
                }}
              >𝕏</button>
              <span className="news-ticker-dot">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
    <div className="news-show-all-wrap">
      <button
        className="news-show-all-btn"
        onClick={() => { setModalOpen(v => !v); track(modalOpen ? 'news_show_less' : 'news_show_all') }}
      >
        {modalOpen ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
            Show less
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
              <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
            </svg>
            Show all {items.length} articles
          </>
        )}
      </button>
    </div>
    </>
  )
}
