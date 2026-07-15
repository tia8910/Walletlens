import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { track, trackAI } from '../analytics'
import CoinLogo from './CoinLogo'
import Icon from './Icon'
import { computeMagic, aggregateMagic } from '../magicIndicator'
import { getAiVerdict } from '../magicAi'
import { isStablecoin } from '../stablecoins'
import { assetClass } from '../data/assets'
import { getCachedCoinImage } from '../api'

const PILLAR_INFO = {
  technical:   'RSI, MACD, Bollinger Bands, trend, Ichimoku Cloud, VWAP and Fibonacci levels.',
  momentum:    'Stochastic RSI, Williams %R, ADX, CCI, MFI, Parabolic SAR, OBV — composite oscillator signal.',
  whales:      'Accumulation vs distribution from volume-weighted flow + exchange transfers.',
  onchain:     'NVT proxy, exchange flow, supply shock, turnover (volume/market-cap), dilution.',
  volume:      'OBV divergence, volume profile, VWAP confirmation, turnover rate.',
  sentiment:   'Fear & Greed Index (contrarian), BTC dominance shift, social buzz, market breadth.',
  cycle:       'Bitcoin halving cycle position, Pi Cycle Top/Bottom, ATH drawdown phase.',
  correlation: 'BTC/SPY/Gold/DXY correlation — regime detection and diversification value.',
  fundamental: 'Market-cap tier, FDV/MC dilution and distance from all-time high.',
}

// All holdings with price data are analyzable — except stablecoins and fiat/cash.
// Stocks, metals, crypto all get full technical analysis.
const isAnalyzable = (h) => {
  const id = h.coin_id
  if (!id) return false
  if (isStablecoin(id, h.coin_symbol)) return false
  if (/^(fiat:|cash:|real:)/.test(id)) return false
  return true
}

const money = (n) => {
  if (n == null || !isFinite(n)) return '—'
  if (Math.abs(n) >= 1) return '$' + Math.round(n).toLocaleString()
  return '$' + (+n).toPrecision(4)
}

// ── Share-image generation (canvas) ───────────────────────────────────────
// Rounded-rect path helper.
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Load an image cross-origin so it can be drawn without tainting the canvas
// (which would block toBlob/toDataURL). Resolves null on error/timeout.
function loadCorsImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    img.onload = () => finish(img)
    img.onerror = () => finish(null)
    setTimeout(() => finish(null), 4500)
    img.src = src
  })
}

// Resolve the asset's logo as a canvas-safe image. Most logo hosts (CoinGecko)
// don't send CORS headers, which would taint the canvas, so we (1) try a direct
// CORS load for hosts that do (jsDelivr), then (2) re-serve every candidate
// through the wsrv.nl image proxy, which always adds `Access-Control-Allow-Origin`
// — making any logo exportable. Falls back to the lettered badge only if all fail.
async function loadCoinLogo(item) {
  const sym = (item.coin_symbol || '').toLowerCase()
  const cached = item.coin_id ? getCachedCoinImage(item.coin_id) : null
  const originals = [
    item.coin_image,
    cached && cached !== item.coin_image ? cached : null,
    sym && `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${sym}.svg`,
  ].filter(Boolean)

  // 1) Direct (works for already-CORS hosts like jsDelivr).
  for (const url of originals) {
    const img = await loadCorsImage(url)
    if (img) return img
  }
  // 2) CORS proxy fallback — reliable for CoinGecko & everything else.
  for (const url of originals) {
    const proxied = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=128&h=128&output=png`
    const img = await loadCorsImage(proxied)
    if (img) return img
  }
  return null
}

// Word-wrap helper — draws text and returns the Y after the last line.
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  const words = text.split(' ')
  let line = '', curY = y, lines = 0
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lines >= maxLines - 1) { ctx.fillText(line + '…', x, curY); return curY + lineHeight }
      ctx.fillText(line, x, curY); line = word; curY += lineHeight; lines++
    } else { line = test }
  }
  if (line) ctx.fillText(line, x, curY)
  return curY + lineHeight
}

// Render a single asset's analysis card to a PNG canvas. When verdict
// (AI Detailed Analysis) is available it extends the canvas to 1080×1800
// and adds a one-liner + bull/bear section below the pillar bars.
// 1800px gives enough headroom for 3 bullets × 3 wrapped lines each plus
// the action line, all well above the footer brand at H-96.
async function drawShareCard(canvas, item, verdict) {
  const m = item.magic
  const logo = await loadCoinLogo(item)
  const W = 1080
  const H = verdict ? 1800 : 1080
  const dpr = 2
  canvas.width = W * dpr; canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const accent = '#00e676'
  const up = '#22c55e', down = '#ef4444'
  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#020f07'); bg.addColorStop(1, '#06160d')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  rr(ctx, 40, 40, W - 80, H - 80, 40)
  ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill()
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,230,118,0.18)'; ctx.stroke()

  const PAD = 84
  // ── Header: coin logo (or lettered badge) + symbol/name ──
  const sym = (item.coin_symbol || '?').toUpperCase()
  const LX = PAD, LY = 96, LS = 92
  if (logo) {
    ctx.save()
    ctx.beginPath(); ctx.arc(LX + LS / 2, LY + LS / 2, LS / 2, 0, Math.PI * 2); ctx.closePath()
    ctx.fillStyle = '#fff'; ctx.fill()
    ctx.clip()
    try { ctx.drawImage(logo, LX, LY, LS, LS) } catch {}
    ctx.restore()
  } else {
    ctx.save()
    rr(ctx, LX, LY, LS, LS, 24)
    const badge = ctx.createLinearGradient(LX, LY, LX + LS, LY + LS)
    badge.addColorStop(0, accent); badge.addColorStop(1, '#00b35a')
    ctx.fillStyle = badge; ctx.fill()
    ctx.fillStyle = '#022'; ctx.font = '800 38px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(sym.slice(0, 4), LX + LS / 2, LY + LS / 2 + 2)
    ctx.restore()
  }

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'; ctx.font = '800 52px Inter, system-ui, sans-serif'
  ctx.fillText(sym, PAD + 116, 138)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '400 30px Inter, system-ui, sans-serif'
  ctx.fillText(item.coin_name || '', PAD + 116, 176)

  // Price · change · weight
  const chg = item.fundamental?.change24h
  let px = PAD
  ctx.font = '700 32px Inter, system-ui, sans-serif'; ctx.fillStyle = '#fff'
  const priceStr = money(item.price)
  ctx.fillText(priceStr, px, 250); px += ctx.measureText(priceStr).width + 22
  if (chg != null) {
    ctx.fillStyle = chg >= 0 ? up : down
    const cstr = `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%`
    ctx.fillText(cstr, px, 250); px += ctx.measureText(cstr).width + 22
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.fillText(`· ${item.weight.toFixed(1)}% of book`, px, 250)

  // ── Verdict label + score ──
  ctx.fillStyle = m.direction.color; ctx.font = '800 72px Inter, system-ui, sans-serif'
  ctx.fillText(m.direction.label, PAD, 360)
  ctx.textAlign = 'right'; ctx.font = '700 48px Inter, system-ui, sans-serif'
  ctx.fillText(`${m.score > 0 ? '+' : ''}${m.score}`, W - PAD, 360)
  ctx.textAlign = 'left'

  // Diverging gauge track
  const gx = PAD, gy = 400, gw = W - PAD * 2, gh = 16
  const grad = ctx.createLinearGradient(gx, 0, gx + gw, 0)
  grad.addColorStop(0, '#ef4444'); grad.addColorStop(0.5, '#9ca3af'); grad.addColorStop(1, '#22c55e')
  rr(ctx, gx, gy, gw, gh, 8); ctx.fillStyle = grad; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1
  const mpos = gx + ((m.score + 100) / 200) * gw
  ctx.beginPath(); ctx.arc(mpos, gy + gh / 2, 18, 0, Math.PI * 2)
  ctx.fillStyle = m.direction.color; ctx.shadowColor = m.direction.color; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '600 24px Inter, system-ui, sans-serif'
  ctx.fillText('Distribute', gx, gy + 56)
  ctx.textAlign = 'center'; ctx.fillText('Neutral', gx + gw / 2, gy + 56)
  ctx.textAlign = 'right'; ctx.fillText('Accumulate', gx + gw, gy + 56)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '400 28px Inter, system-ui, sans-serif'
  ctx.fillText('Confidence ', PAD, gy + 116)
  const cw = ctx.measureText('Confidence ').width
  ctx.fillStyle = '#fff'; ctx.font = '700 28px Inter, system-ui, sans-serif'
  ctx.fillText(`${m.confidence}%`, PAD + cw, gy + 116)

  // ── Pillar bars ──
  let py = 600
  const barX = PAD + 220, barW = W - PAD * 2 - 220 - 110
  for (const p of m.pillars) {
    const est = p.estimated
    const proxy = p.quality === 'proxy'
    const s = p.score ?? 0
    const color = est ? 'rgba(255,255,255,0.35)'
      : proxy ? (s >= 0 ? '#6ee7b7' : '#fca5a5')
      : s >= 0 ? up : down
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 30px Inter, system-ui, sans-serif'
    ctx.fillText(p.label, PAD, py + 8)
    rr(ctx, barX, py - 14, barW, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(barX + barW / 2 - 1, py - 18, 2, 22)
    if (!est && s !== 0) {
      const wpct = Math.min(0.5, Math.abs(s) / 200)
      const fillW = wpct * barW
      const fillL = s >= 0 ? barX + barW / 2 : barX + barW / 2 - fillW
      rr(ctx, fillL, py - 14, Math.max(fillW, 4), 14, 7); ctx.fillStyle = color; ctx.fill()
    }
    ctx.textAlign = 'right'; ctx.fillStyle = color; ctx.font = '700 30px Inter, system-ui, sans-serif'
    ctx.fillText(`${s > 0 ? '+' + s : s}${est ? '*' : proxy ? '~' : ''}`, W - PAD, py + 8)
    ctx.textAlign = 'left'
    py += 66
  }

  // ── Detailed Analysis section (only when verdict is available) ──
  if (verdict) {
    const divY = py + 20
    // Divider + section header
    ctx.fillStyle = 'rgba(0,230,118,0.2)'; ctx.fillRect(PAD, divY, W - PAD * 2, 1)
    ctx.fillStyle = accent; ctx.font = '700 28px Inter, system-ui, sans-serif'
    ctx.fillText('Detailed Analysis', PAD, divY + 46)
    if (verdict.direction) {
      const labelX = PAD + ctx.measureText('Detailed Analysis').width + 24
      rr(ctx, labelX, divY + 22, ctx.measureText(verdict.direction).width + 28, 30, 8)
      ctx.fillStyle = 'rgba(0,230,118,0.18)'; ctx.fill()
      ctx.fillStyle = accent; ctx.font = '600 22px Inter, system-ui, sans-serif'
      ctx.fillText(verdict.direction, labelX + 14, divY + 43)
    }

    let vy = divY + 90
    // One-liner summary
    if (verdict.oneLiner) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '500 30px Inter, system-ui, sans-serif'
      vy = wrapText(ctx, verdict.oneLiner, PAD, vy, W - PAD * 2, 42, 3)
      vy += 14
    }

    // Bull / Bear two-column layout
    const colW = (W - PAD * 2 - 32) / 2
    const bullBullets = (verdict.bull || []).slice(0, 3)
    const bearBullets = (verdict.bear || []).slice(0, 3)
    if (bullBullets.length || bearBullets.length) {
      const colStartY = vy
      // Bull column
      ctx.fillStyle = up; ctx.font = '700 26px Inter, system-ui, sans-serif'
      ctx.fillText('BULL', PAD, colStartY)
      let bullY = colStartY + 36
      for (const b of bullBullets) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '400 24px Inter, system-ui, sans-serif'
        bullY = wrapText(ctx, '• ' + b, PAD, bullY, colW - 16, 34, 3)
        bullY += 4
      }
      // Bear column
      const bearX = PAD + colW + 32
      ctx.fillStyle = down; ctx.font = '700 26px Inter, system-ui, sans-serif'
      ctx.fillText('BEAR', bearX, colStartY)
      let bearY = colStartY + 36
      for (const b of bearBullets) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '400 24px Inter, system-ui, sans-serif'
        bearY = wrapText(ctx, '• ' + b, bearX, bearY, colW - 16, 34, 3)
        bearY += 4
      }
      vy = Math.max(bullY, bearY) + 16
    }

    // Action line
    if (verdict.action) {
      ctx.fillStyle = 'rgba(0,230,118,0.7)'; ctx.font = '600 26px Inter, system-ui, sans-serif'
      vy = wrapText(ctx, '→ ' + verdict.action, PAD, vy, W - PAD * 2, 38, 2)
    }
  }

  // ── Footer brand ──
  ctx.fillStyle = accent; ctx.font = '800 36px Inter, system-ui, sans-serif'
  ctx.fillText('WalletLens', PAD, H - 96)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '400 28px Inter, system-ui, sans-serif'
  ctx.fillText('Track your portfolio free → walletlens.live', PAD, H - 60)
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '400 24px Inter, system-ui, sans-serif'
  ctx.fillText('Magic Indicator · not financial advice', W - PAD, H - 60)
  ctx.textAlign = 'left'
}

// Build the payload sent to the AI verdict endpoint. Shared by the
// "Detailed Analysis" button and the Share button (which auto-fetches).
function buildVerdictPayload(item) {
  return {
    asset: { symbol: item.coin_symbol?.toUpperCase(), name: item.coin_name },
    magic: { score: item.magic.score, direction: item.magic.direction.label, confidence: item.magic.confidence },
    pillars: item.magic.pillars.filter(p => !p.estimated).map(p => ({ label: p.label, score: p.score, note: p.note })),
    stats: {
      rsi: item.ta?.rsi != null ? Math.round(item.ta.rsi) : undefined,
      trend: item.ta?.trend,
      macd: item.ta?.macd?.cross || (item.ta?.macd ? (item.ta.macd.hist > 0 ? 'positive' : 'negative') : undefined),
      whaleScore: item.signals?.whaleScore,
      marketCapRank: item.fundamental?.marketCapRank,
      pctFromATH: item.fundamental?.athChangePct != null ? Math.round(item.fundamental.athChangePct) + '%' : undefined,
      change30d: item.fundamental?.change30d != null ? Math.round(item.fundamental.change30d) + '%' : undefined,
      pnlPct: Math.round(item.pnlPct) + '%',
    },
  }
}

function tweetTextFor(item, verdict) {
  const m = item.magic
  const sym = (item.coin_symbol || '').toUpperCase()
  const pills = m.pillars
    .filter(p => !p.estimated)
    .map(p => `${p.label} ${p.score > 0 ? '+' : ''}${p.score}`)
    .join(' · ')
  const verdictLine = verdict?.oneLiner ? `\n${verdict.oneLiner}` : ''
  // Top bull/bear point each — keeps the tweet readable while surfacing the
  // detailed analysis in the text (the full set still goes in the image).
  const bull = verdict?.bull?.[0] ? `\n${verdict.bull[0]}` : ''
  const bear = verdict?.bear?.[0] ? `\n${verdict.bear[0]}` : ''
  const actionLine = verdict?.action ? `\n→ ${verdict.action}` : ''
  return encodeURIComponent(
    `$${sym} ${item.coin_name ? '— ' + item.coin_name : ''}\n` +
    `Magic Indicator: ${m.direction.label} (${m.score > 0 ? '+' : ''}${m.score}) · ${m.confidence}% confidence\n\n` +
    (pills ? pills + '\n' : '') +
    verdictLine + bull + bear + actionLine + '\n\n' +
    `Tracked free & private with WalletLens → walletlens.live/?ref=share`
  )
}

// ── Per-card "Share to X" button ───────────────────────────────────────────
function ShareCardButton({ item, verdict }) {
  const [sharing, setSharing] = useState(false)

  async function share() {
    if (sharing) return
    setSharing(true)
    // Auto-fetch the Detailed Analysis if the user hasn't run it yet, so the
    // verdict is always included in the share. Uses the 1h cache → instant if
    // already run; a failure just falls back to the indicator-only share.
    let v = verdict
    if (!v) {
      try { v = await getAiVerdict(item.coin_id, buildVerdictPayload(item)) } catch {}
    }
    track('magic_card_share_x', { symbol: item.coin_symbol, hasVerdict: !!v })
    const canvas = document.createElement('canvas')
    try { await drawShareCard(canvas, item, v) } catch { setSharing(false); return }

    const sym = (item.coin_symbol || 'asset').toLowerCase()
    const filename = `walletlens-${sym}.png`
    let usedWebShare = false
    try {
      if (navigator.canShare) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
        if (blob) {
          const file = new File([blob], filename, { type: 'image/png' })
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text: decodeURIComponent(tweetTextFor(item, v)) })
            usedWebShare = true
          }
        }
      }
    } catch (e) {
      if (e?.name === 'AbortError') { setSharing(false); return }
    }
    if (!usedWebShare) {
      // Desktop: download the image so the user can attach it, then open X compose.
      try {
        const dataUrl = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = dataUrl; a.download = filename; a.click()
      } catch {}
      setTimeout(() => window.open(`https://twitter.com/intent/tweet?text=${tweetTextFor(item, v)}`, '_blank', 'noopener'), 400)
    }
    setSharing(false)
  }

  return (
    <button className="magic-share-btn" onClick={share} disabled={sharing}
      title="Share this analysis on X (image included)" aria-label={`Share ${item.coin_symbol} analysis on X`}>
      {sharing ? '…' : (
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      )}
      <span>Share</span>
    </button>
  )
}

// ── Diverging gauge (-100..100) ──────────────────────────────────────────
function MagicGauge({ score, direction, confidence, big }) {
  const pos = ((score + 100) / 200) * 100
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: big ? '1.35rem' : '1.05rem', fontWeight: 800, color: direction.color, display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}>
          <Icon name={direction.icon} size={big ? 22 : 18} /> {direction.label}
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: direction.color }}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>
      <div className="magic-track">
        <div className="magic-track-mid" />
        <div className="magic-marker" style={{ left: `${pos}%`, background: direction.color, boxShadow: `0 0 10px ${direction.color}` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text2)', marginTop: '0.2rem' }}>
        <span>Distribute</span>
        <span>Neutral</span>
        <span>Accumulate</span>
      </div>
      {confidence != null && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: '0.4rem' }}>
          Confidence <b style={{ color: 'var(--text)' }}>{confidence}%</b>
        </div>
      )}
    </div>
  )
}

// ── Five diverging pillar bars ───────────────────────────────────────────
function PillarBars({ pillars }) {
  return (
    <div className="pillar-list">
      {pillars.map((p) => {
        const est = p.estimated
        const proxy = p.quality === 'proxy'
        const s = p.score ?? 0
        const color = est ? 'var(--text2)'
          : proxy ? (s >= 0 ? '#6ee7b7' : '#fca5a5')   // muted = estimated from related data
          : s >= 0 ? '#22c55e' : '#ef4444'
        const widthPct = Math.min(50, Math.abs(s) / 2)
        const marker = est ? '*' : proxy ? '~' : ''
        const title = est ? `${PILLAR_INFO[p.key]} — no live data, shown neutral`
          : proxy ? `${PILLAR_INFO[p.key]} — estimated from related data (live feed unavailable)`
          : PILLAR_INFO[p.key]
        return (
          <div key={p.key} className="pillar-row" title={title}>
            <div className="pillar-name">{p.label}</div>
            <div className="pillar-track">
              <div className="pillar-zero" />
              {!est && s !== 0 && (
                <div
                  className="pillar-fill"
                  style={{ background: color, width: `${widthPct}%`, left: s >= 0 ? '50%' : `${50 - widthPct}%`, opacity: proxy ? 0.7 : 1 }}
                />
              )}
            </div>
            <div className="pillar-val" style={{ color }}>{s > 0 ? '+' + s : s}{marker}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── AI verdict (optional, uses the Anthropic key via the Deno endpoint) ────
function AiVerdict({ item, onVerdictReady }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [verdict, setVerdict] = useState(null)

  async function run() {
    if (state === 'loading') return
    setState('loading')
    trackAI({ action: 'magic_ai_verdict', symbol: item.coin_symbol })
    const v = await getAiVerdict(item.coin_id, buildVerdictPayload(item))
    if (v) {
      setVerdict(v)
      setState('done')
      onVerdictReady?.(v)
    } else {
      setState('error')
    }
  }

  if (state === 'idle') return (
    <button className="magic-ai-btn" onClick={run}>
      <Icon name="search" size={15} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />Detailed Analysis
    </button>
  )
  if (state === 'loading') return <div className="magic-ai-loading"><Icon name="sparkles" size={14} style={{ verticalAlign:'-2px', marginRight:'0.35em' }} />Claude is analysing {item.coin_symbol?.toUpperCase()}…</div>
  if (state === 'error') {
    return (
      <div className="magic-ai-err">
        Detailed analysis unavailable — the indicator above still reflects the full analysis.
        <button className="magic-ai-btn" style={{ marginLeft: '0.5rem' }} onClick={run}>Retry</button>
      </div>
    )
  }
  return (
    <div className="magic-ai-card">
      <div className="magic-ai-head">
        <Icon name="search" size={16} style={{ verticalAlign: '-3px', marginRight: '0.35em' }} />Detailed Analysis
        {verdict.direction ? <span className="magic-ai-dir">{verdict.direction}</span> : null}
      </div>
      {verdict.oneLiner && <p className="magic-ai-line">{verdict.oneLiner}</p>}
      <div className="magic-ai-cols">
        {verdict.bull?.length > 0 && (
          <div>
            <div className="magic-ai-col-h" style={{ color: 'var(--g-ink)' }}>Bull</div>
            <ul>{verdict.bull.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
        {verdict.bear?.length > 0 && (
          <div>
            <div className="magic-ai-col-h" style={{ color: '#ef4444' }}>Bear</div>
            <ul>{verdict.bear.map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
      </div>
      {verdict.action && <p className="magic-ai-action">→ {verdict.action}</p>}
    </div>
  )
}

// ── Per-asset card ─────────────────────────────────────────────────────────
function AssetCard({ item, onOpen }) {
  const m = item.magic
  const chg = item.fundamental?.change24h
  const ta = item.ta
  const [verdict, setVerdict] = useState(null)
  return (
    <div className="glass-card magic-card">
      <div className="magic-card-head" onClick={onOpen} style={{ cursor: 'pointer' }}>
        <CoinLogo image={item.coin_image} symbol={item.coin_symbol} coinId={item.coin_id} size={38} className="coin-logo" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontWeight: 800 }}>{item.coin_symbol?.toUpperCase()}</span>
            <span className="muted" style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.coin_name}</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
            {money(item.price)}
            {chg != null && <span style={{ marginLeft: '0.4rem', color: chg >= 0 ? 'var(--g-ink)' : '#ef4444' }}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}%</span>}
            <span style={{ marginLeft: '0.4rem' }}>· {item.weight.toFixed(1)}% of book</span>
          </div>
        </div>
      </div>

      <div style={{ margin: '0.85rem 0' }}>
        <MagicGauge score={m.score} direction={m.direction} confidence={m.confidence} />
      </div>

      <PillarBars pillars={m.pillars} />

      {ta && (
        <div className="magic-ta-strip">
          {ta.trend && <span>{ta.trend}</span>}
          {ta.rsi != null && <span>RSI {Math.round(ta.rsi)}</span>}
          {ta.nearestSupport != null && <span>S {money(ta.nearestSupport)}</span>}
          {ta.nearestResistance != null && <span>R {money(ta.nearestResistance)}</span>}
          {item.fundamental?.marketCapRank && <span>#{item.fundamental.marketCapRank}</span>}
        </div>
      )}

      <div className="magic-card-foot">
        <AiVerdict item={item} onVerdictReady={setVerdict} />
        <div className="magic-foot-actions">
          <ShareCardButton item={item} verdict={verdict} />
          <button className="magic-detail-link" onClick={onOpen}>Full chart →</button>
        </div>
      </div>
    </div>
  )
}

// Shared Magic Indicator analysis view. Takes already-enriched holdings
// (with coin_id, coin_symbol, coin_name, coin_image, amount, price, value).
export default function MagicAnalysisPanel({ enriched = [], totalValue = 0 }) {
  const navigate = useNavigate()
  const [ta, setTa] = useState({})
  const [signals, setSignals] = useState({})
  const [fundamentals, setFundamentals] = useState({})
  const [analyzing, setAnalyzing] = useState(false)
  const [catFilter, setCatFilter] = useState('all')

  const cryptoIds = useMemo(
    () => enriched.filter(isAnalyzable).map(h => h.coin_id),
    [enriched]
  )
  const idsKey = cryptoIds.join(',')

  useEffect(() => {
    if (!cryptoIds.length) return
    let alive = true
    setAnalyzing(true)
    track('magic_analysis_view', { assets: cryptoIds.length })
    // TA + Fundamentals in parallel (Fundamentals is a single bulk call).
    // Signals runs AFTER to avoid simultaneous CoinGecko bursts that trigger 429s.
    ;(async () => {
      const [t, f] = await Promise.all([
        api.getBulkTechnicals(cryptoIds).catch(() => ({})),
        api.getBulkFundamentals(cryptoIds).catch(() => ({})),
      ])
      if (!alive) return
      setTa(t || {}); setFundamentals(f || {})
      const s = await api.getBulkSmartSignals(cryptoIds).catch(() => ({}))
      if (!alive) return
      setSignals(s || {})
      setAnalyzing(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  const { cryptoItems, nonCryptoCount, compass } = useMemo(() => {
    const tv = totalValue || enriched.reduce((s, h) => s + (h.value || 0), 0)
    const cryptoItems = enriched
      .filter(isAnalyzable)
      .map(h => {
        const magic = computeMagic({
          ta: ta[h.coin_id] || null,
          signals: signals[h.coin_id] || null,
          fundamental: fundamentals[h.coin_id] || null,
          assetClass: h._cat || 'crypto',
        })
        return {
          ...h,
          pnlPct: h.pnlPct ?? (h.invested > 0 ? ((h.value - h.invested) / h.invested) * 100 : 0),
          ta: ta[h.coin_id] || null,
          signals: signals[h.coin_id] || null,
          fundamental: fundamentals[h.coin_id] || null,
          magic,
          weight: tv > 0 ? (h.value / tv) * 100 : 0,
        }
      })
      .filter(it => it.magic)
      .sort((a, b) => b.value - a.value)
    const compass = aggregateMagic(cryptoItems.map(it => ({ value: it.value, magic: it.magic })))
    const nonCryptoCount = enriched.filter(h => !isAnalyzable(h)).length
    // Add asset class category to each item
    const withCategory = cryptoItems.map(it => ({ ...it, _cat: assetClass(it.coin_id) }))
    return { cryptoItems: withCategory, nonCryptoCount, compass }
  }, [enriched, totalValue, ta, signals, fundamentals])

  // Category counts for tabs
  const catCounts = useMemo(() => {
    const counts = { all: cryptoItems.length }
    for (const it of cryptoItems) {
      const c = it._cat || 'crypto'
      counts[c] = (counts[c] || 0) + 1
    }
    return counts
  }, [cryptoItems])

  // Filtered items by category
  const filteredItems = useMemo(() => {
    if (catFilter === 'all') return cryptoItems
    return cryptoItems.filter(it => it._cat === catFilter)
  }, [cryptoItems, catFilter])

  if (!cryptoIds.length) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
        <div style={{ marginBottom: '0.4rem', display: 'flex', justifyContent: 'center' }}><Icon name="pulse" size={30} style={{ color: 'var(--g-ink)', fontWeight: 700 }} /></div>
        <p className="muted" style={{ margin: 0 }}>
          Add a holding to see the Magic Indicator — technicals, momentum, volume, sentiment
          and more merged into one direction. Works for crypto, stocks, gold and silver.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Category filter tabs */}
      {Object.keys(catCounts).length > 2 && (
        <div style={{ display: 'flex', gap: '0.4rem', margin: '0.6rem 0.75rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {[['all', 'All'], ['crypto', 'Crypto'], ['stock', 'Stocks'], ['gold', 'Gold'], ['silver', 'Silver']].filter(([k]) => catCounts[k] > 0).map(([key, label]) => (
            <button key={key} onClick={() => setCatFilter(key)} style={{
              padding: '0.4rem 0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700,
              background: catFilter === key ? 'var(--g)' : 'var(--surface-1)',
              color: catFilter === key ? '#fff' : 'var(--text-muted)',
              boxShadow: catFilter === key ? '0 2px 8px rgba(var(--g-rgb),0.3)' : 'none',
              transition: 'all 0.15s',
            }}>
              {label} ({catCounts[key] || 0})
            </button>
          ))}
        </div>
      )}

      {compass && (
        <div className="glass-card magic-compass">
          <div className="magic-compass-label">PORTFOLIO COMPASS · {compass.assets} asset{compass.assets === 1 ? '' : 's'}</div>
          <MagicGauge score={compass.score} direction={compass.direction} confidence={compass.confidence} big />
          <p className="muted" style={{ fontSize: '0.78rem', margin: '0.6rem 0 0' }}>
            Value-weighted blend across your crypto book. Not financial advice.
          </p>
        </div>
      )}

      {analyzing && cryptoItems.length === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '2rem' }}>Crunching indicators…</div>
      )}

      <div className="magic-grid">
        {filteredItems.map(item => (
          <AssetCard key={item.coin_id} item={item} onOpen={() => navigate(`/asset/${item.coin_id}`)} />
        ))}
      </div>

      {filteredItems.some(it => it.magic?.pillars?.some(p => p.estimated || p.quality === 'proxy')) && (
        <p className="muted" style={{ fontSize: '0.72rem', margin: '0.6rem 0.2rem 0' }}>
          <b>~</b> estimated from related data and <b>*</b> shown neutral when a live feed is
          temporarily unavailable (rate-limited). These count at reduced or zero weight, so the
          headline reading stays driven by live data — values refresh automatically within the hour.
        </p>
      )}

      {nonCryptoCount > 0 && (
        <div className="glass-card" style={{ marginTop: '1rem', padding: '0.9rem 1.1rem' }}>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
            ℹ️ {nonCryptoCount} holding{nonCryptoCount === 1 ? '' : 's'} excluded — stablecoins and cash/fiat have no meaningful price series to analyze.
          </p>
        </div>
      )}
    </div>
  )
}
