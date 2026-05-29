import { Link, useParams } from 'react-router-dom'
import Logo from '../components/Logo'
import { POSTS } from '../data/blogPosts'

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
        <a className="lp-footer-x" href="https://x.com/walletlenss" target="_blank" rel="noopener noreferrer">
          <svg className="lp-x-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          @walletlenss
        </a>
      </footer>
    </div>
  )
}
