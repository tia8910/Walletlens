import { useState } from 'react'
import { track } from '../analytics'

const KEY_STORAGE = 'walletlens_anthropic_key'
const MODEL = 'claude-opus-4-7'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

export default function AISellPlan({ enriched = [], prices = {} }) {
  const [plan, setPlan] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generatePlan() {
    const key = localStorage.getItem(KEY_STORAGE)
    if (!key) {
      setError('Add your Anthropic API key in the AI Advisor tab first.')
      return
    }
    if (!enriched.length) {
      setError('Add some holdings first.')
      return
    }

    setLoading(true)
    setError('')
    setPlan('')
    track('ai_sell_plan_generate')

    const holdings = enriched.map(h => {
      const price   = prices[h.coin_id]?.usd ?? prices[h.coin_id]?.price ?? 0
      const value   = h.amount * price
      const pnl     = value - h.total_invested
      const pnlPct  = h.total_invested > 0 ? ((pnl / h.total_invested) * 100).toFixed(1) : '0'
      const chg24   = prices[h.coin_id]?.usd_24h_change?.toFixed(2) ?? '?'
      return `${h.coin_symbol?.toUpperCase()}: $${value.toFixed(0)} value | ${pnlPct}% P&L | 24h: ${chg24}%`
    }).join('\n')

    const prompt = `You are a seasoned crypto portfolio manager. Generate a clear, actionable sell plan for this portfolio.

Holdings:
${holdings}

For each position provide:
1. Current status (hold / partial take-profit / full exit)
2. Specific price target(s) to sell at
3. % of position to sell at each target
4. The core reason in one sentence

Then give an overall portfolio strategy in 2-3 sentences.

Format with clear sections per coin. Be direct and specific — no vague advice.`

    try {
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || 'API error')
      setPlan(data.content?.[0]?.text || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-card" style={{ marginTop: '1rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
        <div>
          <h3 style={{ margin:0, fontSize:'1rem' }}>🎯 AI Sell Plan</h3>
          <p className="muted" style={{ margin:'0.2rem 0 0', fontSize:'0.8rem' }}>
            Claude analyzes your portfolio and tells you exactly when and how much to sell.
          </p>
        </div>
        <button
          onClick={generatePlan}
          disabled={loading}
          style={{
            background: loading ? 'rgba(52,211,153,0.2)' : '#34d399',
            color: loading ? '#34d399' : '#000',
            border: 'none', borderRadius: 10, padding: '0.5rem 1.1rem',
            fontWeight: 700, fontSize: '0.85rem', cursor: loading ? 'default' : 'pointer',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
          {loading ? '⏳ Generating…' : '✨ Generate Plan'}
        </button>
      </div>

      {error && <p style={{ color:'#f87171', fontSize:'0.85rem', margin:'0.5rem 0 0' }}>{error}</p>}

      {plan && (
        <div style={{
          marginTop: '0.75rem',
          background: 'rgba(52,211,153,0.04)',
          border: '1px solid rgba(52,211,153,0.15)',
          borderRadius: 12, padding: '1rem',
          fontSize: '0.88rem', lineHeight: 1.7,
          color: 'rgba(255,255,255,0.85)',
          whiteSpace: 'pre-wrap',
        }}>
          {plan}
        </div>
      )}
    </div>
  )
}
