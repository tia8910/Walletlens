import { useLanguage } from '../LanguageContext'
import { LEVELS } from '../portfolioPulse'

// The pulse card under the hero: a heartbeat whose speed follows how hard the
// portfolio is moving, judged against the owner's own normal day.
const SPEED = ['2.6s', '1.7s', '1.1s', '0.7s']

export default function PortfolioPulse({ reading, level, swingUsd = 0, hidden = false, leftOut = 0, money }) {
  const { t } = useLanguage()
  if (!reading || !(reading.rms > 0)) return null
  const name = LEVELS[level.level]
  const fmt = (v) => (hidden ? '••••' : money(v))
  return (
    <section className={`pp-card pp-${name}`} aria-label={t('ppTitle')} style={{ '--pp-speed': SPEED[level.level] }}>
      <div className="pp-head">
        <span className="pp-dot" aria-hidden="true"><i /><i /></span>
        <b>{t('ppTitle')}</b>
        <span className="pp-level">{t(`ppLevel_${name}`)}</span>
      </div>
      <svg className="pp-ecg" viewBox="0 0 340 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 34 H60 L70 34 L78 14 L86 52 L94 26 L102 34 H160 L170 34 L178 10 L186 54 L194 24 L202 34 H260 L270 34 L278 12 L286 52 L294 26 L302 34 H340" />
      </svg>
      <div className="pp-stats">
        <span><small>{t('ppTypical')}</small><b>{reading.rms.toFixed(1)}%</b></span>
        <span><small>{t('ppNormal')}</small><b>{level.normal != null ? `${level.normal.toFixed(1)}%` : '-'}</b></span>
        <span><small>{t('ppSwing')}</small><b className={swingUsd < 0 ? 'down' : 'up'}>{swingUsd < 0 ? '-' : '+'}{fmt(Math.abs(swingUsd))}</b></span>
      </div>
      <div className="pp-scale" aria-hidden="true">
        {LEVELS.map((l, i) => <i key={l} className={`pp-s${i}${i === level.level ? ' on' : ''}`} />)}
      </div>
      {reading.contributors.length > 0 && (
        <div className="pp-drivers">
          <small className="pp-eyebrow">{t('ppDriving')}</small>
          {reading.contributors.slice(0, 3).map(c => (
            <div key={c.id || c.sym} className="pp-drv">
              <b>{c.sym}</b>
              <span>{c.pct >= 0 ? '+' : ''}{c.pct.toFixed(1)}% · {t('ppOfPortfolio')(c.weight.toFixed(0))}</span>
              <b className={c.pct < 0 ? 'down' : 'up'}>{c.share.toFixed(0)}%</b>
            </div>
          ))}
        </div>
      )}
      <small className="pp-note">
        {level.learning ? t('ppLearning')(level.days, 5) : t('ppVsNormal')(level.days)}
        {leftOut > 0 ? ` ${t('ppLeftOut')(leftOut)}` : ''}
      </small>
    </section>
  )
}
