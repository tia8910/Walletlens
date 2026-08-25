import { useState, useMemo, useEffect } from 'react'
import { useLanguage } from '../LanguageContext'
import Icon from './Icon'
import { track } from '../analytics'
import {
  computeZakat, loadSettings, saveSettings, loadHawl, saveHawl,
  loadIntents, saveIntents, markPaid, saveDueDate, DEFAULT_SETTINGS, HAWL, REASONS,
} from '../zakat'
import { formatHijri, hijriSupported } from '../hijri'

// Zakat al-Mal calculator.
//
// The screen is built around one idea the user must not be able to miss: the
// hawl runs on the whole portfolio, not on each holding. People arrive
// expecting a per-asset clock ("is my Bitcoin a year old yet?") and that
// expectation produces underpayment, so the year card states the rule outright
// rather than leaving it to be inferred from the numbers.
//
// Everything contested is a visible setting with a stated default, and the
// result carries its own assumptions. This app does not issue fatwa.

const REASON_KEY = {
  [REASONS.cash]: 'zkWhyCash',
  [REASONS.metals]: 'zkWhyMetals',
  [REASONS.stable]: 'zkWhyStable',
  [REASONS.crypto]: 'zkWhyCrypto',
  [REASONS.cryptoOff]: 'zkWhyCryptoOff',
  [REASONS.shareTrade]: 'zkWhyShareTrade',
  [REASONS.shareLong]: 'zkWhyShareLong',
  [REASONS.homeOrRental]: 'zkWhyHome',
  [REASONS.resell]: 'zkWhyResell',
}

function money(n, currency = 'USD') {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency, maximumFractionDigits: n < 100 ? 2 : 0,
  }).format(n)
}

function Row({ label, value, strong, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', padding: '0.45rem 0' }}>
      <span style={{ fontSize: strong ? '0.92rem' : '0.85rem', fontWeight: strong ? 700 : 500, color: strong ? 'var(--text)' : 'var(--text-muted)' }}>
        {label}
        {hint && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-sub)', fontWeight: 400 }}>{hint}</span>}
      </span>
      <span style={{ fontSize: strong ? '1rem' : '0.88rem', fontWeight: strong ? 800 : 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

function Choice({ label, hint, options, value, onChange }) {
  return (
    <div className="settings-row" style={{ paddingTop: '0.45rem' }}>
      <div className="settings-label">
        <span>{label}</span>
        {hint && <span className="settings-hint">{hint}</span>}
      </div>
      <div className="settings-chips">
        {options.map(o => (
          <button key={o.value}
            className={`settings-chip${value === o.value ? ' active' : ''}`}
            onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ZakatCalculator({ holdings = [], prices = {} }) {
  const { t, lang } = useLanguage()
  const [settings, setSettings] = useState(() => loadSettings())
  const [intents, setIntents] = useState(() => loadIntents())
  const [hawl, setHawl] = useState(() => loadHawl())
  const [showSettings, setShowSettings] = useState(false)
  const [showRows, setShowRows] = useState(false)
  const [debtInput, setDebtInput] = useState(() => String(loadSettings().liabilities || ''))

  const z = useMemo(
    () => computeZakat({ holdings, prices, settings, intents, hawl, now: new Date() }),
    [holdings, prices, settings, intents, hawl],
  )

  // The hawl advances as a side effect of looking at it — starting the clock
  // the first time wealth reaches nisab, and rolling it after a payment. Only
  // persist a state that actually changed, and never while the nisab price is
  // unknown, which is the case that must not touch stored state at all.
  useEffect(() => {
    if (z.hawl?.unknown) return
    const next = { startedAt: z.hawl.startedAt, paidFor: z.hawl.paidFor }
    const prev = hawl || { startedAt: null, paidFor: [] }
    if (next.startedAt === prev.startedAt && next.paidFor.length === prev.paidFor.length) return
    saveHawl(next)
    setHawl(next)
  }, [z.hawl, hawl])

  // Hand the push registration the one thing it is allowed to know. A date,
  // and only when there is actually a year running — nothing about the amount,
  // the portfolio, or whether the user is above nisab ever leaves the device.
  useEffect(() => {
    saveDueDate(z.status === HAWL.BELOW || !z.dueAt
      ? null
      : z.dueAt.toISOString().slice(0, 10))
  }, [z.status, z.dueAt])

  const update = (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next); saveSettings(next)
  }
  const setIntent = (id, v) => {
    const next = { ...intents }
    if (v) next[id] = v; else delete next[id]
    setIntents(next); saveIntents(next)
  }

  const onPaid = () => {
    if (!z.dueAt) return
    const next = markPaid(hawl, z.dueAt)
    saveHawl(next); setHawl(next)
    track('zakat_marked_paid', { amount: Math.round(z.amount) })
  }

  const classifiable = z.rows.filter(r => r.category === 'stocks' || r.category === 'realestate')

  const statusTone = z.status === HAWL.DUE ? '#fbbf24'
    : z.status === HAWL.RUNNING ? '#10b981'
      : 'var(--text-muted)'

  return (
    <div className="glass-card" style={{ marginTop: '0.75rem' }}>
      <h3 style={{ margin: '0 0 0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.45em', fontSize: '0.95rem', fontWeight: 700 }}>
        <Icon name="crescent" size={16} />{t('zkTitle')}
      </h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {t('zkSubtitle')}
      </p>

      {!z.nisabKnown && (
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--r, #ef4444)' }}>
          {t('zkNoNisab')}
        </p>
      )}

      {/* ── The year ── stated as a rule, not left to be inferred ── */}
      <div style={{
        borderRadius: 12, padding: '0.9rem 1rem', marginBottom: '1rem',
        background: `linear-gradient(135deg, ${statusTone}1a, ${statusTone}0a)`,
        border: `1px solid ${statusTone}40`,
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusTone }}>
          {z.status === HAWL.DUE ? t('zkStatusDue')
            : z.status === HAWL.RUNNING ? t('zkStatusRunning')
              : t('zkStatusBelow')}
        </div>

        {z.status === HAWL.BELOW && (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {z.nisabKnown ? t('zkBelowBody')(money(z.nisab), money(z.shortBy)) : t('zkBelowUnknown')}
          </p>
        )}

        {z.status === HAWL.RUNNING && (
          <>
            <p style={{ margin: '0.4rem 0 0.6rem', fontSize: '0.85rem', lineHeight: 1.5 }}>
              {t('zkRunningBody')(z.daysElapsed, z.daysRemaining)}
            </p>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, background: statusTone,
                width: `${Math.min(100, Math.max(0, (z.daysElapsed / z.yearLength) * 100))}%`,
              }} />
            </div>
            <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.65rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-sub)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                {t('zkProjected')}
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {money(z.amount)}
              </div>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {t('zkDueBody')((z.rate * 100).toFixed(z.rate === 0.025 ? 1 : 3), money(z.net))}
              </p>
            </div>
          </>
        )}

        {z.status === HAWL.DUE && (
          <>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0.35rem 0 0.15rem', fontVariantNumeric: 'tabular-nums' }}>
              {money(z.amount)}
            </div>
            <p style={{ margin: '0 0 0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {t('zkDueBody')((z.rate * 100).toFixed(z.rate === 0.025 ? 1 : 3), money(z.net))}
            </p>
            <button className="settings-chip" onClick={onPaid}>
              <Icon name="check" size={14} /> {t('zkMarkPaid')}
            </button>
          </>
        )}

        {z.startedAt && (
          <div style={{ marginTop: '0.6rem', fontSize: '0.74rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
            {t('zkStartedOn')(
              z.startedAt.toLocaleDateString(),
              hijriSupported() && settings.yearBasis === 'lunar' ? formatHijri(z.startedAt, { locale: lang }) : null,
            )}
            {z.dueAt && <><br />{t('zkDueOn')(
              z.dueAt.toLocaleDateString(),
              hijriSupported() && settings.yearBasis === 'lunar' ? formatHijri(z.dueAt, { locale: lang }) : null,
            )}</>}
          </div>
        )}
      </div>

      {/* The rule people get wrong. Stated plainly, always visible. */}
      <p style={{
        margin: '0 0 1rem', padding: '0.65rem 0.8rem', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)', fontSize: '0.78rem',
        color: 'var(--text-muted)', lineHeight: 1.55,
      }}>
        <Icon name="info" size={13} style={{ verticalAlign: '-2px', marginInlineEnd: '0.35rem' }} />
        {t('zkHawlNote')}
      </p>

      {/* ── The money ── */}
      <Row label={t('zkNisab')} hint={t('zkNisabHint')(settings.nisabStandard === 'gold' ? '85g' : '595g')}
        value={z.nisabKnown ? money(z.nisab) : '—'} />
      <Row label={t('zkZakatable')} value={money(z.gross)} />
      {z.excluded > 0 && <Row label={t('zkExcluded')} value={`− ${money(z.excluded)}`} />}
      {z.debts > 0 && <Row label={t('zkDebts')} value={`− ${money(z.debts)}`} />}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0.4rem 0' }} />
      <Row strong label={t('zkNet')} value={money(z.net)} />

      {/* ── Liabilities ── the app has no model for these, so they are asked for ── */}
      <div className="settings-row" style={{ paddingTop: '0.7rem', display: 'block' }}>
        <div className="settings-label" style={{ marginBottom: '0.4rem' }}>
          <span>{t('zkDebts')}</span>
          <span className="settings-hint">{t('zkDebtsHint')}</span>
        </div>
        <input
          type="number" inputMode="decimal" min="0" className="bs-input"
          value={debtInput}
          onChange={e => setDebtInput(e.target.value)}
          onBlur={() => update({ liabilities: Math.max(0, parseFloat(debtInput) || 0) })}
          placeholder="0"
          style={{ width: '100%' }}
        />
      </div>

      {/* ── Per-holding intent ── only for the categories where it changes the answer ── */}
      {classifiable.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {t('zkIntentHeading')}
          </div>
          {classifiable.map(r => (
            <div key={r.id} className="settings-row" style={{ paddingTop: '0.35rem' }}>
              <div className="settings-label">
                <span>{r.name}</span>
                <span className="settings-hint">{money(r.value)} · {t(REASON_KEY[r.reason])}</span>
              </div>
              <div className="settings-chips">
                {(r.category === 'stocks'
                  ? [{ v: 'trade', l: t('zkIntentTrade') }, { v: '', l: t('zkIntentLong') }]
                  : [{ v: 'resell', l: t('zkIntentResell') }, { v: '', l: t('zkIntentKeep') }]
                ).map(o => (
                  <button key={o.v || 'default'}
                    className={`settings-chip${(intents[r.id] || '') === o.v ? ' active' : ''}`}
                    onClick={() => setIntent(r.id, o.v)}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Where it came from ── */}
      <button className="settings-chip" style={{ marginTop: '1rem' }} onClick={() => setShowRows(v => !v)}>
        {showRows ? '▾' : '▸'} {t('zkBreakdown')}
      </button>
      {showRows && (
        <div style={{ marginTop: '0.6rem' }}>
          {z.rows.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.35rem 0', fontSize: '0.8rem', opacity: r.counted > 0 ? 1 : 0.55 }}>
              <span>
                {r.name}
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-sub)' }}>{t(REASON_KEY[r.reason])}</span>
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {money(r.counted)}
                {r.portion > 0 && r.portion < 1 && (
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-sub)' }}>
                    {Math.round(r.portion * 100)}% {t('zkOf')} {money(r.value)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── The contested inputs ── */}
      <button className="settings-chip" style={{ marginTop: '0.5rem' }} onClick={() => setShowSettings(v => !v)}>
        {showSettings ? '▾' : '▸'} {t('zkAssumptions')}
      </button>
      {showSettings && (
        <div style={{ marginTop: '0.5rem' }}>
          <Choice label={t('zkStandard')} hint={t('zkStandardHint')}
            value={settings.nisabStandard}
            onChange={v => update({ nisabStandard: v })}
            options={[{ value: 'silver', label: t('zkSilver') }, { value: 'gold', label: t('zkGold') }]} />

          <Choice label={t('zkYearBasis')} hint={t('zkYearBasisHint')}
            value={settings.yearBasis}
            onChange={v => update({ yearBasis: v })}
            options={[{ value: 'lunar', label: t('zkLunar') }, { value: 'solar', label: t('zkSolar') }]} />

          <Choice label={t('zkDipRule')} hint={t('zkDipHint')}
            value={settings.dipRule}
            onChange={v => update({ dipRule: v })}
            options={[{ value: 'ignore', label: t('zkDipIgnore') }, { value: 'reset', label: t('zkDipReset') }]} />

          <Choice label={t('zkCryptoRule')} hint={t('zkCryptoHint')}
            value={settings.cryptoZakatable ? 'yes' : 'no'}
            onChange={v => update({ cryptoZakatable: v === 'yes' })}
            options={[{ value: 'yes', label: t('zkYes') }, { value: 'no', label: t('zkNo') }]} />

          <div className="settings-row" style={{ paddingTop: '0.45rem', display: 'block' }}>
            <div className="settings-label" style={{ marginBottom: '0.4rem' }}>
              <span>{t('zkSharePortion')(Math.round((settings.longTermSharePortion ?? 0.3) * 100))}</span>
              <span className="settings-hint">{t('zkSharePortionHint')}</span>
            </div>
            <input type="range" min="0" max="100" step="5"
              value={Math.round((settings.longTermSharePortion ?? 0.3) * 100)}
              onChange={e => update({ longTermSharePortion: Number(e.target.value) / 100 })}
              style={{ width: '100%', accentColor: 'var(--g)' }} />
          </div>
        </div>
      )}

      <p style={{ margin: '1rem 0 0', fontSize: '0.72rem', color: 'var(--text-sub)', lineHeight: 1.55 }}>
        {t('zkDisclaimer')}
      </p>
    </div>
  )
}
