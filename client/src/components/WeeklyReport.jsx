import { useRef, useState, useEffect } from 'react'
import { track } from '../analytics'
import { loadSnapshots } from '../snapshots'

function fmtUsd(n) {
  if (!n && n !== 0) return '$0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return sign + '$' + (abs/1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + '$' + (abs/1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return sign + '$' + (abs/1e3).toFixed(1) + 'K'
  return sign + '$' + abs.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
function fmtPct(n) { return (n >= 0 ? '+' : '') + (n || 0).toFixed(2) + '%' }
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2)
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y)
  ctx.closePath()
}

function computeWeeklyStats() {
  const snaps = loadSnapshots()
  if (snaps.length < 2) return null
  const now = Date.now()
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000

  const thisWeek = snaps.filter(s => s.ts >= oneWeekAgo)
  const lastWeek = snaps.filter(s => s.ts >= twoWeeksAgo && s.ts < oneWeekAgo)

  const current = snaps[snaps.length - 1]
  const weekStart = thisWeek[0] || snaps[snaps.length - 2]
  const lastWeekEnd = lastWeek[lastWeek.length - 1]

  const weekChange = current.v - weekStart.v
  const weekChangePct = weekStart.v > 0 ? (weekChange / weekStart.v) * 100 : 0
  const lastWeekChangePct = lastWeekEnd && lastWeek[0]
    ? ((lastWeekEnd.v - lastWeek[0].v) / lastWeek[0].v) * 100
    : null

  // Mini chart — last 7 days of snapshots
  const chartSnaps = snaps.slice(-7)

  return {
    currentValue: current.v,
    weekChange,
    weekChangePct,
    lastWeekChangePct,
    chartSnaps,
    daysTracked: snaps.length,
    weekLabel: new Date(weekStart.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' – ' + new Date(current.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }
}

function drawReport(canvas, stats, enriched) {
  const W = 1080, H = 1080
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const gRgb = getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '0,200,83'

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#020f07'); bg.addColorStop(1, '#071a0c')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  // Glow
  const gl = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 500)
  gl.addColorStop(0, `rgba(${gRgb},0.08)`); gl.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H)

  // Grid
  ctx.strokeStyle = `rgba(${gRgb},0.04)`; ctx.lineWidth = 1
  for (let i = 1; i < 9; i++) {
    ctx.beginPath(); ctx.moveTo(W/8*i, 0); ctx.lineTo(W/8*i, H); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, H/8*i); ctx.lineTo(W, H/8*i); ctx.stroke()
  }

  // Border
  ctx.strokeStyle = `rgba(${gRgb},0.2)`; ctx.lineWidth = 2
  rr(ctx, 2, 2, W-4, H-4, 32); ctx.stroke()

  // Top accent bar
  ctx.fillStyle = '#00c853'; ctx.fillRect(0, 0, W, 6)

  // Logo
  const lx = 80, ly = 80
  ctx.strokeStyle = '#00c853'; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(lx, ly, 28, 0, Math.PI*2); ctx.stroke()
  ctx.lineWidth = 3.5; ctx.globalAlpha = 0.55
  ctx.beginPath(); ctx.arc(lx, ly, 16, 0, Math.PI*2); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#00c853'
  ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI*2); ctx.fill()

  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.textAlign = 'left'; ctx.fillText('WalletLens', lx + 44, ly + 10)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '15px system-ui, sans-serif'
  ctx.fillText('walletlens.cc', lx + 44, ly + 32)

  // WEEKLY REPORT label
  ctx.textAlign = 'right'; ctx.fillStyle = `rgba(${gRgb},0.6)`
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('WEEKLY REPORT', W - 64, ly - 10)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '13px system-ui, sans-serif'
  ctx.fillText(stats.weekLabel, W - 64, ly + 14)

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(60, 130); ctx.lineTo(W-60, 130); ctx.stroke()

  // Week label
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '600 14px system-ui, sans-serif'
  ctx.fillText('THIS WEEK', 64, 175)

  // Big value
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 86px system-ui, sans-serif'
  ctx.fillText(fmtUsd(stats.currentValue), 64, 272)

  // Week change pill
  const up = stats.weekChange >= 0
  const pillColor = up ? '#00e676' : '#ff5252'
  const pillBg = up ? 'rgba(0,230,118,0.14)' : 'rgba(255,82,82,0.14)'
  const pillText = (up ? '▲ +' : '▼ ') + fmtUsd(Math.abs(stats.weekChange)) + '  ' + fmtPct(stats.weekChangePct)
  ctx.font = 'bold 22px system-ui, sans-serif'
  const pw = ctx.measureText(pillText).width + 40
  ctx.fillStyle = pillBg; rr(ctx, 64, 292, pw, 48, 12); ctx.fill()
  ctx.strokeStyle = up ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.25)'; ctx.lineWidth = 1
  rr(ctx, 64, 292, pw, 48, 12); ctx.stroke()
  ctx.fillStyle = pillColor; ctx.textAlign = 'left'
  ctx.fillText(pillText, 84, 324)

  // vs last week
  if (stats.lastWeekChangePct != null) {
    const lw = stats.lastWeekChangePct
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '14px system-ui, sans-serif'
    ctx.fillText(`vs last week: ${fmtPct(lw)}`, 64 + pw + 20, 322)
  }

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(60, 368); ctx.lineTo(W-60, 368); ctx.stroke()

  // Mini sparkline chart
  if (stats.chartSnaps.length >= 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillText('7-DAY CHART', 64, 406)

    const chartX = 64, chartY = 420, chartW = W - 128, chartH = 160
    const vals = stats.chartSnaps.map(s => s.v)
    const minV = Math.min(...vals), maxV = Math.max(...vals)
    const vRange = maxV - minV || 1

    const points = vals.map((v, i) => ({
      x: chartX + (i / (vals.length - 1)) * chartW,
      y: chartY + chartH - ((v - minV) / vRange) * chartH,
    }))

    // Fill gradient
    const fillGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH)
    fillGrad.addColorStop(0, up ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.2)')
    fillGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = fillGrad
    ctx.beginPath()
    ctx.moveTo(points[0].x, chartY + chartH)
    points.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.lineTo(points[points.length-1].x, chartY + chartH)
    ctx.closePath(); ctx.fill()

    // Line
    ctx.strokeStyle = up ? '#00e676' : '#ff5252'; ctx.lineWidth = 3
    ctx.shadowColor = up ? '#00e676' : '#ff5252'; ctx.shadowBlur = 8
    ctx.beginPath(); points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.stroke(); ctx.shadowBlur = 0

    // Dots on each data point
    ctx.fillStyle = up ? '#00e676' : '#ff5252'
    points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill() })
  }

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(60, 608); ctx.lineTo(W-60, 608); ctx.stroke()

  // Top holdings this week
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillText('CURRENT HOLDINGS', 64, 646)

  const holdings = (enriched || []).slice(0, 4)
  const colW2 = (W - 128) / Math.max(holdings.length, 1)
  holdings.forEach((h, i) => {
    const cx = 64 + colW2 * i
    const sym = (h.coin_symbol || h.symbol || '?').toUpperCase()
    const pnl = h.pnlPct || 0
    const pColor = pnl >= 0 ? '#00e676' : '#ff5252'

    rr(ctx, cx, 660, colW2 - 16, 120, 12)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1
    rr(ctx, cx, 660, colW2 - 16, 120, 12); ctx.stroke()

    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px system-ui, sans-serif'
    ctx.textAlign = 'left'; ctx.fillText(sym, cx + 14, 692)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(fmtUsd(h.value), cx + 14, 714)
    ctx.fillStyle = pColor; ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText(fmtPct(pnl), cx + 14, 734)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '11px system-ui, sans-serif'
    ctx.fillText(`${(h.value/(stats.currentValue||1)*100).toFixed(1)}% of portfolio`, cx + 14, 752)
  })

  // Stats row
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(60, 810); ctx.lineTo(W-60, 810); ctx.stroke()

  const statItems = [
    { label: 'Days Tracked', val: stats.daysTracked },
    { label: 'Assets', val: (enriched||[]).length },
    { label: 'All-Time P&L', val: (() => { const invested = stats.chartSnaps[0]?.inv || 0; return invested > 0 ? fmtPct((stats.currentValue - invested)/invested*100) : 'N/A' })() },
  ]
  statItems.forEach((s, i) => {
    const sx = 64 + (W - 128) / 3 * i
    ctx.textAlign = 'left'
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px system-ui, sans-serif'
    ctx.fillText(s.val, sx, 858)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(s.label, sx, 880)
  })

  // Bottom bar
  ctx.fillStyle = `rgba(${gRgb},0.06)`; ctx.fillRect(0, H - 72, W, 72)
  ctx.textAlign = 'right'; ctx.fillStyle = '#00c853'; ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillText('Track yours free → walletlens.cc', W - 64, H - 24)
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('#WalletLens  #CryptoPortfolio  #WeeklyReport', 64, H - 24)
}

export default function WeeklyReport({ enriched, totalValue, onClose }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [sharing, setSharing] = useState(false)
  const stats = computeWeeklyStats()

  useEffect(() => {
    if (canvasRef.current && stats) {
      drawReport(canvasRef.current, stats, enriched)
      setReady(true)
    }
  }, [])

  function download() {
    track('weekly_report_download')
    const a = document.createElement('a')
    a.href = canvasRef.current.toDataURL('image/png')
    a.download = `walletlens-weekly-${new Date().toISOString().split('T')[0]}.png`
    a.click()
  }

  async function shareToX() {
    if (sharing) return
    setSharing(true)
    track('weekly_report_share_x')
    const up = stats?.weekChange >= 0
    const text = encodeURIComponent(
      `My crypto portfolio week: ${up ? '📈' : '📉'} ${(up?'+':'')}${stats?.weekChangePct?.toFixed(1)}%\n\nCurrent value: ${totalValue ? ('$'+(totalValue/1000).toFixed(1)+'K') : 'undisclosed'}\n\nTracked with @walletlenss — free, private, no account.\n\nwalletlens.cc #WalletLens`
    )
    try {
      if (navigator.canShare) {
        const dataUrl = canvasRef.current.toDataURL('image/png')
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], 'walletlens-weekly.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: decodeURIComponent(text) })
          setSharing(false); return
        }
      }
    } catch {}
    download()
    setTimeout(() => window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener'), 400)
    setSharing(false)
  }

  if (!stats) return (
    <div className="share-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="share-modal">
        <div className="share-modal-header"><span>Weekly Report</span><button className="share-close" onClick={onClose}>✕</button></div>
        <div style={{ padding:'2rem', textAlign:'center' }}>
          <div style={{ fontSize:'2rem', marginBottom:'0.75rem' }}>📅</div>
          <p style={{ color:'var(--text)', fontSize:'0.9rem' }}>
            Keep the app open for a few days and WalletLens will build your real portfolio history. Your first weekly report will be ready soon!
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="share-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="share-modal">
        <div className="share-modal-header">
          <span>📅 Weekly Report — {stats.weekLabel}</span>
          <button className="share-close" onClick={onClose}>✕</button>
        </div>
        <canvas ref={canvasRef} className="share-canvas" />
        <div className="share-actions">
          <button className="share-btn share-btn-dl" onClick={download}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Save Image
          </button>
          <button className="share-btn share-btn-tweet" onClick={shareToX} disabled={sharing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            {sharing ? 'Opening…' : 'Share on X'}
          </button>
        </div>
        <p className="share-hint">📱 On mobile the image attaches directly to your post.</p>
      </div>
    </div>
  )
}
