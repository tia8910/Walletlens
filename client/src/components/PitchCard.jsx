import { useEffect, useState } from 'react'
import { useLanguage } from '../LanguageContext'

// Cycling-word headline matching the walletlens.html mock-up.
// Replaces the previous "Why WalletLens" features box.
const WORDS = [
  'every asset',
  'crypto & stocks',
  'gold & silver',
  'your wealth',
  'fiat & FX',
]

export default function PitchCard({ className = '' }) {
  const { t } = useLanguage()
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setFade(true)
      setTimeout(() => {
        setIdx(i => (i + 1) % WORDS.length)
        setFade(false)
      }, 260)
    }, 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={`tagline-hero ${className}`} aria-label={t('atTagline')}>
      <div className="tagline-tag">
        <span className="tagline-tag-dot" />
        100% Free · No Account
      </div>
      <h2 className="tagline-headline">
        See{' '}
        <span className={`tagline-cycle ${fade ? 'tagline-fade' : ''}`}>
          {WORDS[idx]}
        </span>
        <br />in one lens.
      </h2>
    </div>
  )
}
