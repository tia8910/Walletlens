import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CoinLogo from './CoinLogo'
import IndicatorChart from './IndicatorChart'
import { isStablecoin } from '../stablecoins'
import { useLanguage } from '../LanguageContext'

// Technicals: the asset page's indicator chart for any holding, picked from
// a row of chips (largest holding first). With nothing to chart yet it
// offers the majors so the tool still shows what it does.

const MAJORS = [
  { coin_id: 'bitcoin', coin_symbol: 'BTC', coin_name: 'Bitcoin' },
  { coin_id: 'ethereum', coin_symbol: 'ETH', coin_name: 'Ethereum' },
  { coin_id: 'solana', coin_symbol: 'SOL', coin_name: 'Solana' },
]

// Stablecoins and cash have no chart worth reading.
const chartable = (h) => h.coin_id && !isStablecoin(h.coin_id, h.coin_symbol) && !/^(fiat:|cash:|real:|bond:|other:)/.test(h.coin_id)

export default function TechChartPanel({ enriched }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const assets = useMemo(() => {
    const own = (enriched || []).filter(chartable).slice().sort((a, b) => (b.value || 0) - (a.value || 0))
    return own.length ? own : MAJORS
  }, [enriched])
  const [picked, setPicked] = useState(null)
  const cur = assets.find(a => a.coin_id === picked) || assets[0]

  return (
    <div className="tc-panel">
      <div className="tc-assets" role="tablist" aria-label={t('acPickAsset')}>
        {assets.map(a => (
          <button key={a.coin_id} role="tab" aria-selected={a.coin_id === cur.coin_id}
            className={`tc-asset${a.coin_id === cur.coin_id ? ' on' : ''}`} onClick={() => setPicked(a.coin_id)}>
            <CoinLogo image={a.image} symbol={a.coin_symbol} coinId={a.coin_id} size={20} />
            <span>{a.coin_symbol}</span>
          </button>
        ))}
      </div>
      <div className="tc-head">
        <CoinLogo image={cur.image} symbol={cur.coin_symbol} coinId={cur.coin_id} size={32} />
        <div className="tc-name"><b>{cur.coin_name || cur.coin_symbol}</b><small>{cur.coin_symbol}</small></div>
        <button className="tc-open" onClick={() => navigate(`/asset/${encodeURIComponent(cur.coin_id)}`)}>{t('acOpenAsset')} ›</button>
      </div>
      <IndicatorChart key={cur.coin_id} coinId={cur.coin_id} symbol={cur.coin_symbol} name={cur.coin_name}
        price={cur.price || 0} source="technicals" />
    </div>
  )
}
