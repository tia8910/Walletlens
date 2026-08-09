import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { inline } from '../components/DocProse'
import { aboutContent } from '../data/aboutContent'
import { aboutFaqs } from '../data/faqContent'

export default function About() {
  const { t, lang } = useLanguage()
  const doc = aboutContent(lang)
  const faqs = aboutFaqs(lang)

  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>{doc.title}</h1>
        <p className="doc-meta">{doc.meta}</p>

        {doc.blocks.map(([kind, body], i) => {
          if (kind === 'h2') return <h2 key={i}>{body}</h2>
          if (kind === 'p') return <p key={i}>{inline(body)}</p>
          if (kind === 'ul') {
            return (
              <ul key={i}>
                {body.map((item, j) => <li key={j}>{inline(item)}</li>)}
              </ul>
            )
          }
          // The question list, shared with /faq/ so the two cannot drift.
          return (
            <div key={i} className="doc-faq">
              {faqs.map(f => (
                <details key={f.q} className="doc-faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          )
        })}
      </article>
      <footer className="doc-footer">
        <Link to="/">{t('docBackTo')}</Link>
        <Link to="/blog/">{t('blog')}</Link>
        <Link to="/privacy/">{t('privacy')}</Link>
      </footer>
    </div>
  )
}
