import { track } from '../analytics'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'

// A way from a feature in the app to its landing page, the full story told
// with pictures, in the reader's language. The pages are static HTML on the
// same origin, so this is a plain link: a full page load, inside the
// installed app too.

const LANGS = ['en', 'ar', 'fr', 'es', 'de', 'it']
const SLUG = { zakat: 'zakat', guardian: 'portfolio-guardian' }

export const landingPath = (page, lang = 'en') => {
  const l = LANGS.includes(lang) ? lang : 'en'
  return (l === 'en' ? '' : `/${l}`) + `/${SLUG[page]}/`
}

const COPY = {
  zakat: {
    en: ['How WalletLens calculates zakat', 'Nisab, the Hijri year and what counts, explained'],
    ar: ['كيف يحسب WalletLens الزكاة', 'النصاب والحول الهجري وما يدخل في الزكاة، بشرح واضح'],
    fr: ['Comment WalletLens calcule la zakat', 'Le nisab, l’année hégirienne et ce qui compte, expliqués'],
    es: ['Cómo calcula WalletLens el zakat', 'El nisab, el año hégira y lo que cuenta, explicado'],
    de: ['Wie WalletLens die Zakat berechnet', 'Nisab, Mondjahr und was zählt, erklärt'],
    it: ['Come WalletLens calcola la zakat', 'Il nisab, l’anno dell’Egira e cosa conta, spiegati'],
  },
  guardian: {
    en: ['How Portfolio Guardian works', 'The countdown, who is told and what they receive'],
    ar: ['كيف يعمل حارس المحفظة', 'العداد ومن يتم إبلاغه وما الذي يصله'],
    fr: ['Comment fonctionne Portfolio Guardian', 'Le compte à rebours, qui est prévenu et ce qu’il reçoit'],
    es: ['Cómo funciona Portfolio Guardian', 'La cuenta atrás, a quién se avisa y qué recibe'],
    de: ['So funktioniert Portfolio Guardian', 'Der Countdown, wer benachrichtigt wird und was ankommt'],
    it: ['Come funziona Portfolio Guardian', 'Il conto alla rovescia, chi viene avvisato e cosa riceve'],
  },
}

export default function LandingLink({ page, source, style }) {
  const { lang } = useLanguage()
  const [title, sub] = (COPY[page][lang] || COPY[page].en)
  return (
    <a
      className="wl-landing-link"
      href={landingPath(page, lang)}
      style={style}
      onClick={() => track('landing_link_click', { page, source })}
    >
      <span className="wl-landing-link-ic" aria-hidden="true"><Icon name={page === 'zakat' ? 'crescent' : 'shield'} size={18} /></span>
      <span className="wl-landing-link-txt"><b>{title}</b><small>{sub}</small></span>
      <svg className="wl-landing-link-go" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </a>
  )
}
