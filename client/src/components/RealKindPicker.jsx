import { useMemo } from 'react'
import { realAssetsCopy } from '../realAssetsCopy'
import { KINDS } from '../realAssets'
import { KIND_UI, KindIcon } from './realAssetsUi'
import '../realAssets.css'

/**
 * The trade sheet's "Other": what is it? A real estate, a car, a watch…
 * Each opens the smart form for that kind; a bare name stays one tap away.
 */
export default function RealKindPicker({ lang, onPick, onQuick }) {
  const c = useMemo(() => realAssetsCopy(lang), [lang])
  return (
    <div className="rk">
      <div className="rk-head">
        <b>{c('pickTitle')}</b>
        <small>{c('pickSub')}</small>
      </div>
      <div className="rk-grid">
        {KINDS.map(k => (
          <button key={k} type="button" className={`rk-tile${k === 'other' ? ' is-wide' : ''}`} style={{ '--c': KIND_UI[k].c }} onClick={() => onPick(k)}>
            <span className="rk-ic"><KindIcon kind={k} size={20} /></span>
            <span className="rk-txt"><b>{c(`k_${k}`)}</b><small>{c(`d_${k}`)}</small></span>
            <svg className="rk-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        ))}
      </div>
      <button type="button" className="rk-quick" onClick={onQuick}>{c('quickName')}</button>
    </div>
  )
}
