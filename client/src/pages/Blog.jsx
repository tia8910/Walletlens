import { Link, useParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Logo from '../components/Logo'
import { POSTS, relatedPosts } from '../data/blogPosts'

const ORIGIN = 'https://walletlens.live'

// Keep <head> in sync with the current blog route for client-side navigation
// (the prerendered static HTML already covers crawlers that don't run JS; this
// covers SPA navigation and JS-executing AI/search bots). Restores defaults on
// unmount so other routes aren't left with a stale title/canonical.
function useBlogHead(post) {
  useEffect(() => {
    const prevTitle = document.title
    const setMeta = (selector, attr, value) => {
      let el = document.head.querySelector(selector)
      if (!el) {
        el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
        if (selector.startsWith('link')) el.setAttribute('rel', 'canonical')
        else if (selector.includes('property=')) el.setAttribute('property', selector.match(/property="([^"]+)"/)[1])
        else el.setAttribute('name', selector.match(/name="([^"]+)"/)[1])
        document.head.appendChild(el)
      }
      el.setAttribute(attr, value)
      return el
    }

    const url = post ? `${ORIGIN}/blog/${post.slug}` : `${ORIGIN}/blog`
    const title = post ? `${post.title} | WalletLens` : 'Blog — Portfolio Tracking, Crypto Investing & Market Analysis | WalletLens'
    const desc = post ? post.summary : 'Free guides on tracking your crypto, stocks and gold portfolio, reading whale transactions, the Fear & Greed Index, diversification, and setting profit targets.'

    document.title = title
    setMeta('meta[name="description"]', 'content', desc)
    setMeta('link[rel="canonical"]', 'href', url)
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', desc)
    setMeta('meta[property="og:url"]', 'content', url)
    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[name="twitter:description"]', 'content', desc)

    return () => { document.title = prevTitle }
  }, [post])
}

function ShareBar({ post }) {
  const [copied, setCopied] = useState(false)
  const url = `https://walletlens.live/blog/${post.slug}`
  const tweetText = encodeURIComponent(`${post.title}\n\n${post.summary}\n\n${url}`)

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="blog-share-bar">
      <span className="blog-share-label">Share</span>
      <a
        className="blog-share-btn blog-share-x"
        href={`https://twitter.com/intent/tweet?text=${tweetText}`}
        target="_blank" rel="noopener noreferrer"
        aria-label="Share on X"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Post on X
      </a>
      <button className="blog-share-btn blog-share-copy" onClick={copyLink} aria-label="Copy link">
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        )}
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  )
}

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

function RelatedPosts({ slug }) {
  const related = relatedPosts(slug, 3)
  if (!related.length) return null
  return (
    <nav className="blog-related" aria-label="Related articles">
      <h2 className="blog-related-title">Keep reading</h2>
      <div className="blog-related-grid">
        {related.map(p => (
          <Link key={p.slug} to={`/blog/${p.slug}`} className="blog-related-card">
            <span className="blog-related-meta">{p.readTime}</span>
            <span className="blog-related-name">{p.title}</span>
            <span className="blog-related-cta">Read →</span>
          </Link>
        ))}
      </div>
    </nav>
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
  useBlogHead(post)

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
          <ShareBar post={post} />
          <div className="blog-cta-box">
            <strong>Start tracking your portfolio for free</strong>
            <p>WalletLens is 100% free, no account required, and all your data stays on your device.</p>
            <Link to="/dashboard" className="blog-cta-btn">Open WalletLens →</Link>
          </div>
          <RelatedPosts slug={post.slug} />
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
