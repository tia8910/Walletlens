import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import DocProse from '../components/DocProse'
import { terms } from '../legal/terms'

export default function Terms() {
  const { t, lang } = useLanguage()
  const doc = terms[lang] || terms.en
  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <DocProse doc={doc} notice={lang !== 'en' ? t('legalEnglishGoverns') : null} />
      </article>
      <footer className="doc-footer">
        <Link to="/">← Back to WalletLens</Link>
        <Link to="/privacy/">Privacy Policy</Link>
        <Link to="/about/">About</Link>
        <Link to="/blog/">Blog</Link>
      </footer>
    </div>
  )
}
