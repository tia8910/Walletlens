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

  if (!items.length) return null

  // Duplicate items so the scroll loops seamlessly
  const doubled = [...items, ...items]

  return (
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
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="news-ticker-item"
              onClick={() => track('news_ticker_click', { source: item.source, title: item.title?.slice(0, 60) })}
            >
              <span className="news-ticker-source" style={{ color: item.sourceColor }}>{item.source}</span>
              <span className="news-ticker-title">{item.title}</span>
              <span className="news-ticker-dot">·</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
