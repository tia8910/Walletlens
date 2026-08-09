import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useLanguage } from '../LanguageContext'
import { faqSections, FAQ_SECTIONS } from '../data/faqContent'

// The questions themselves live in data/faqContent.js, in all four languages.
//
// FAQ_SECTIONS is re-exported because two things still need the English set
// specifically: legal.test.js, which checks the content, and the prerenderer's
// FAQPage JSON-LD, which describes the English page served at the canonical
// URL (client/scripts/prerender.mjs mirrors it — keep the two in sync).
export { FAQ_SECTIONS }

export default function FAQ() {
  const { t, lang } = useLanguage()

  useEffect(() => {
    document.title = `${t('faqTitle')} — WalletLens`
  }, [t])

  const sections = faqSections(lang)

  return (
    <div className="doc-page">
      <header className="doc-header">
        <Link to="/" className="doc-brand"><Logo size={26} /> WalletLens</Link>
      </header>
      <article className="doc-article">
        <h1>{t('faqTitle')}</h1>
        <p className="doc-meta">{t('faqSub')}</p>

        {sections.map(section => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <div className="doc-faq">
              {section.faqs.map(f => (
                <details key={f.q} className="doc-faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}

        <h2>{t('faqStillAsk')}</h2>
        <p>
          {t('faqEmailUs')} <a href="mailto:contact@walletlens.live">contact@walletlens.live</a>,{' '}
          {t('faqReadMore')} <Link to="/about/">{t('faqAboutPage')}</Link>,{' '}
          {t('faqOrBrowse')} <Link to="/blog/">{t('faqBlogGuides')}</Link>.{' '}
          {t('faqReadyStart')} <Link to="/dashboard/">{t('faqOpenFree')}</Link> {t('faqNoAccount')}
        </p>
      </article>
      <footer className="doc-footer">
        <Link to="/">{t('docBackTo')}</Link>
        <Link to="/about/">{t('about')}</Link>
        <Link to="/blog/">{t('blog')}</Link>
        <Link to="/privacy/">{t('privacy')}</Link>
        <Link to="/terms/">{t('terms')}</Link>
      </footer>
    </div>
  )
}
