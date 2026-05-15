import { useEffect, useState, useRef } from 'react'
import { track } from '../analytics'

const RSS_FEEDS = [
  { name: 'CoinTelegraph',   url: 'https://cointelegraph.com/rss',                   color: '#f7931a' },
  { name: 'CoinDesk',        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#1a9fff' },
  { name: 'Decrypt',         url: 'https://decrypt.co/feed',                         color: '#6b21a8' },
  { name: 'Bitcoin Magazine', url: 'https://bitcoinmagazine.com/feed',               color: '#ff9900' },
]

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
      return {
        title:       get('title'),
        link:        get('link') || '',
        pubDate:     get('pubDate'),
        source:      feed.name,
        sourceColor: feed.color,
      }
    }).filter(a => a.title && a.link)
  } catch { return [] }
}

async function fetchFeed(feed) {
  try {
    const res = await fetchWithTimeout('https://corsproxy.io/?' + encodeURIComponent(feed.url), 10000)
    if (res.ok) {
      const items = parseRssXml(await res.text(), feed)
      if (items.length) return items
    }
  } catch { /* try fallback */ }
  const res = await fetchWithTimeout('https://api.allorigins.win/get?url=' + encodeURIComponent(feed.url), 12000)
  if (!res.ok) throw new Error('failed')
  const json = await res.json()
  return parseRssXml(json.contents || '', feed)
}

export default function NewsTicker() {
  const [items, setItems]     = useState([])
  const [paused, setPaused]   = useState(false)
  const trackRef              = useRef(null)
  const animRef               = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Try cached /news.json first
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

      // Live RSS
      const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed))
      if (cancelled) return
      const all = []
      for (const r of results) {
        if (r.status === 'fulfilled') all.push(...r.value)
      }
      // Deduplicate + shuffle sources
      const seen = new Set()
      const deduped = all.filter(a => {
        const k = a.title?.slice(0, 50)
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      if (deduped.length) setItems(deduped)
    }

    load()
    return () => { cancelled = true }
  }, [])

  const [modalOpen, setModalOpen] = useState(false)

  if (!items.length) return null

  const doubled = [...items, ...items]

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
              Crypto News · {items.length} articles
            </span>
            <button className="news-modal-close" onClick={() => setModalOpen(false)}>✕</button>
          </div>
          <div className="news-modal-list">
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
                    const text = encodeURIComponent(`${item.title} — via walletlens.cc`)
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
                  const text = encodeURIComponent(`${item.title} — via walletlens.cc`)
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
        onClick={() => { setModalOpen(true); track('news_show_all') }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
          <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
        </svg>
        Show all {items.length} articles
      </button>
    </div>
    </>
  )
}
