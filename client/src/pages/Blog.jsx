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

    // Trailing slash matches the URL GitHub Pages actually serves (the
    // prerendered canonical uses the same form — they must agree).
    const url = post ? `${ORIGIN}/blog/${post.slug}/` : `${ORIGIN}/blog/`
    const title = post ? `${post.seoTitle || post.title} | WalletLens` : 'WalletLens Blog — Crypto & Investing Guides'
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

function getArticleExcerpt(content, maxLen) {
  const lines = content.trim().split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (t && !t.startsWith('#') && !t.startsWith('-') && !t.startsWith('|') && !t.startsWith('>') && t.length > 40) {
      const clean = t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      return clean.length > maxLen ? clean.slice(0, maxLen - 1) + '…' : clean
    }
  }
  return ''
}

function toArticleText(post, url) {
  const lines = post.content.trim().split('\n')
  const out = []
  for (const line of lines) {
    if (line.startsWith('## ')) {
      out.push('\n' + line.slice(3).toUpperCase() + '\n')
    } else if (line.startsWith('### ')) {
      out.push('\n' + line.slice(4) + '\n')
    } else if (line.startsWith('> ')) {
      out.push(line.slice(2).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    } else if (line.startsWith('- ')) {
      out.push('• ' + line.slice(2).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    } else if (/^\d+\. /.test(line)) {
      out.push(line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    } else if (line.startsWith('| ') || line.startsWith('|---')) {
      // skip table rows
    } else if (line.startsWith('**') && line.endsWith('**')) {
      out.push('\n' + line.slice(2, -2) + '\n')
    } else {
      const clean = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      out.push(clean)
    }
  }
  return `${post.title}\n\n${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n\n— Read on WalletLens: ${url}`
}

function ShareBar({ post }) {
  const [articleCopied, setArticleCopied] = useState(false)
  const url = `https://walletlens.live/blog/${post.slug}`
  const excerpt = getArticleExcerpt(post.content, 180 - post.title.length)
  const tweetText = encodeURIComponent(`${post.title}\n\n${excerpt}\n\n${url}`)

  function openXPost(e) {
    e.preventDefault()
    const appUrl = `twitter://post?message=${tweetText}`
    const webUrl = `https://x.com/intent/post?text=${tweetText}`
    const fallback = setTimeout(() => {
      window.open(webUrl, '_blank', 'noopener,noreferrer')
    }, 1500)
    const cancel = () => clearTimeout(fallback)
    window.addEventListener('blur', cancel, { once: true })
    window.addEventListener('pagehide', cancel, { once: true })
    window.location.href = appUrl
  }

  function copyForArticle() {
    const text = toArticleText(post, url)
    navigator.clipboard.writeText(text).then(() => {
      setArticleCopied(true)
      setTimeout(() => setArticleCopied(false), 8000)
    })
  }

  return (
    <div className="blog-share-bar">
      <span className="blog-share-label">Share</span>
      <a
        className="blog-share-btn blog-share-x"
        href={`https://x.com/intent/post?text=${tweetText}`}
        onClick={openXPost}
        aria-label="Share on X"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Post on X
      </a>
      <button className="blog-share-btn blog-share-article" onClick={copyForArticle} aria-label="Copy full article text for an X Article">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 10h16M4 14h10"/><circle cx="19" cy="17" r="3"/><path d="m21.5 19.5-1.5-1.5"/></svg>
        {articleCopied ? 'Article copied ✓' : 'Copy full article'}
      </button>
      {articleCopied && (
        <p className="blog-share-hint">
          Full article copied. On X (desktop, Premium+ required): open the
          {' '}<strong>Articles</strong> tab in the sidebar → <strong>Write</strong> → paste with Ctrl/⌘+V.
          {' '}X Articles can't be created in the mobile app.
        </p>
      )}
    </div>
  )
}

function PostCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}/`} className="blog-card">
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
          <Link key={p.slug} to={`/blog/${p.slug}/`} className="blog-related-card">
            <span className="blog-related-meta">{p.readTime}</span>
            <span className="blog-related-name">{p.title}</span>
            <span className="blog-related-cta">Read →</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}

function parseInline(text) {
  const segments = []
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+|\/[^)]*)\)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push(text.slice(last, m.index))
    if (m[1] != null) {
      segments.push(<strong key={m.index}>{m[1]}</strong>)
    } else if (m[3].startsWith('http')) {
      segments.push(<a key={m.index} href={m[3]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g-ink)' }}>{m[2]}</a>)
    } else {
      segments.push(<Link key={m.index} to={m[3]} style={{ color: 'var(--g-ink)' }}>{m[2]}</Link>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push(text.slice(last))
  return segments
}

function renderMarkdown(text) {
  const lines = text.trim().split('\n')
  const result = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      result.push(<h2 key={i}>{parseInline(line.slice(3))}</h2>)
    } else if (line.startsWith('### ')) {
      result.push(<h3 key={i}>{parseInline(line.slice(4))}</h3>)
    } else if (line.startsWith('**') && line.endsWith('**')) {
      result.push(<p key={i}><strong>{line.slice(2, -2)}</strong></p>)
    } else if (line.startsWith('> ')) {
      result.push(<blockquote key={i} style={{ borderLeft: '3px solid var(--g-ink)', paddingLeft: '1rem', margin: '1rem 0', opacity: 0.8 }}>{parseInline(line.slice(2))}</blockquote>)
    } else if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(<li key={i}>{parseInline(lines[i].slice(2))}</li>)
        i++
      }
      result.push(<ul key={'ul' + i}>{items}</ul>)
      continue
    } else if (/^\d+\. /.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i}>{parseInline(lines[i].replace(/^\d+\. /, ''))}</li>)
        i++
      }
      result.push(<ol key={'ol' + i}>{items}</ol>)
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
      result.push(<p key={i}>{parseInline(line)}</p>)
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
        <article className="doc-article"><h1>Post not found</h1><Link to="/blog/">← Back to Blog</Link></article>
      </div>
    )
  }

  if (post) {
    return (
      <div className="doc-page">
        <header className="doc-header"><Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link></header>
        <article className="doc-article">
          <Link to="/blog/" className="blog-back">← All Articles</Link>
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
            <Link to="/dashboard/" className="blog-cta-btn">Open WalletLens →</Link>
          </div>
          <RelatedPosts slug={post.slug} />
        </article>
        <footer className="doc-footer">
          <Link to="/blog/">← All Articles</Link>
          <Link to="/">Home</Link>
          <Link to="/privacy/">Privacy Policy</Link>
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
        <Link to="/about/">About</Link>
        <Link to="/privacy/">Privacy Policy</Link>
      </footer>
    </div>
  )
}
