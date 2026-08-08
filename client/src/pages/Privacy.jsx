import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import DocProse from '../components/DocProse'
import { privacy } from '../legal/privacy'

export default function Privacy() {
  const { t, lang } = useLanguage()
  // Falls back to English for a language the document has not been translated
  // into yet, which is the same behaviour as a missing key in i18n.js.
  const doc = privacy[lang] || privacy.en
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
        <Link to="/terms/">Terms of Service</Link>
        <Link to="/about/">About</Link>
        <Link to="/blog/">Blog</Link>
      </footer>
    </div>
  )
}
