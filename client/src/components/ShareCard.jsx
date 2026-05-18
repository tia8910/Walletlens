import { useRef, useState, useEffect } from 'react'
import { track } from '../analytics'

function getThemeColors() {
  const style = getComputedStyle(document.documentElement)
  const g = style.getPropertyValue('--g').trim() || '#00c853'
  const gRgb = style.getPropertyValue('--g-rgb').trim() || '0,200,83'
  // Derive darker bg from theme
  const bgMap = {
    '0,200,83':    { bg0: '#020f07', bg1: '#041208', accent: g },      // green
    '139,92,246':  { bg0: '#0d0a1a', bg1: '#120f22', accent: g },      // solana purple
    '59,130,246':  { bg0: '#05080f', bg1: '#080d1a', accent: g },      // blue
    '234,179,8':   { bg0: '#100e02', bg1: '#1a1503', accent: g },      // gold
    '239,68,68':   { bg0: '#100505', bg1: '#180808', accent: g },      // red
  }
  return bgMap[gRgb] || { bg0: '#020f07', bg1: '#041208', accent: g }
}

function fmtUsd(n) {
  if (!n && n !== 0) return '$0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K'
  return sign + '$' + abs.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '0.00%'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}

// Draw rounded rect
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawSparkline(ctx, series, x, y, w, h, positive) {
  if (!series || series.length < 2) return
  const vals = series.map(p => p.v || 0)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const pts = vals.map((v, i) => ({
    px: x + (i / (vals.length - 1)) * w,
    py: y + h - ((v - min) / range) * h,
  }))
  // Fill
  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, positive ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.18)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.beginPath()
  ctx.moveTo(pts[0].px, y + h)
  pts.forEach(p => ctx.lineTo(p.px, p.py))
  ctx.lineTo(pts[pts.length - 1].px, y + h)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()
  // Line
  ctx.beginPath()
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py))
  ctx.strokeStyle = positive ? '#00e676' : '#ff5252'
  ctx.lineWidth = 2.5
  ctx.shadowColor = positive ? '#00e676' : '#ff5252'
  ctx.shadowBlur = 8
  ctx.stroke()
  ctx.shadowBlur = 0
}

function drawCard(canvas, { totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL, perfSeries, theme }) {
  const W = 1200, H = 630, dpr = 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const accent = theme?.accent || '#00c853'

  // ── Background ──────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, theme?.bg0 || '#020f07')
  bg.addColorStop(0.6, theme?.bg1 || '#041208')
  bg.addColorStop(1, theme?.bg1 || '#071a0c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle radial glow top-left
  const glow = ctx.createRadialGradient(200, 120, 0, 200, 120, 480)
  glow.addColorStop(0, accent + '22')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Glow bottom-right
  const glow2 = ctx.createRadialGradient(W - 150, H - 80, 0, W - 150, H - 80, 320)
  glow2.addColorStop(0, accent + '14')
  glow2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  // ── Grid lines ──────────────────────────────────────────────────────────
  ctx.strokeStyle = accent + '0a'
  ctx.lineWidth = 1
  for (let i = 1; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(0, H / 6 * i); ctx.lineTo(W, H / 6 * i); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 6 * i, 0); ctx.lineTo(W / 6 * i, H); ctx.stroke()
  }

  // Left accent bar
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, 5, H)

  // ── Border ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = accent + '30'
  ctx.lineWidth = 1.5
  rr(ctx, 1, 1, W - 2, H - 2, 24)
  ctx.stroke()

  // ── WalletLens logo (concentric circles) ────────────────────────────────
  const lx = 70, ly = 52
  ctx.strokeStyle = accent; ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(lx, ly, 28, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 3.5; ctx.globalAlpha = 0.55
  ctx.beginPath(); ctx.arc(lx, ly, 16, 0, Math.PI * 2); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = accent
  ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill()

  // ── WalletLens wordmark ──────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('WalletLens', lx + 40, ly + 9)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText('walletlens.cc', lx + 40, ly + 28)

  // ── Tagline (top right) ──────────────────────────────────────────────────
  ctx.fillStyle = accent + '99'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('Zoom in your wealth 🔍', W - 48, 52)

  // ── Divider ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(48, 92); ctx.lineTo(W - 48, 92); ctx.stroke()

  // ── Total value ───────────────────────────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.letterSpacing = '0.1em'
  ctx.fillText('MY PORTFOLIO', 64, 136)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 76px system-ui, sans-serif'
  ctx.fillText(fmtUsd(totalValue), 64, 220)

  // ── P&L pill ─────────────────────────────────────────────────────────────
  const pnlPositive = totalPnL >= 0
  const pnlColor = pnlPositive ? '#00e676' : '#ff5252'
  const pnlBg = pnlPositive ? 'rgba(0,230,118,0.14)' : 'rgba(255,82,82,0.14)'
  const pnlText = (pnlPositive ? '▲ ' : '▼ ') + (pnlPositive ? '+' : '') + fmtUsd(totalPnL) + '   ' + fmtPct(totalPnLPct)
  ctx.font = 'bold 20px system-ui, sans-serif'
  const pnlW = ctx.measureText(pnlText).width + 36
  ctx.fillStyle = pnlBg
  rr(ctx, 64, 234, pnlW, 44, 12)
  ctx.fill()
  // Pill border
  ctx.strokeStyle = pnlPositive ? 'rgba(0,230,118,0.25)' : 'rgba(255,82,82,0.25)'
  ctx.lineWidth = 1
  rr(ctx, 64, 234, pnlW, 44, 12)
  ctx.stroke()
  ctx.fillStyle = pnlColor
  ctx.textAlign = 'left'
  ctx.fillText(pnlText, 82, 262)

  // ── Today P&L ────────────────────────────────────────────────────────────
  if (todayPnL != null) {
    const todayPos = todayPnL >= 0
    const todayColor = todayPos ? '#69f0ae' : '#ff8a80'
    const todayText = 'Today  ' + (todayPos ? '+' : '') + fmtUsd(todayPnL)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText('Today', 64 + pnlW + 18, 252)
    ctx.fillStyle = todayColor
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText((todayPos ? '+' : '') + fmtUsd(todayPnL), 64 + pnlW + 18, 270)
  }

  // ── Sparkline ─────────────────────────────────────────────────────────────
  drawSparkline(ctx, perfSeries, W / 2 + 20, 130, W / 2 - 68, 150, totalPnL >= 0)

  // ── Divider ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(48, 304); ctx.lineTo(W - 48, 304); ctx.stroke()

  // ── Top holdings label ───────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('TOP HOLDINGS', 64, 338)

  const cols = Math.min(topHoldings.length, 4)
  const colW = (W - 96) / Math.max(cols, 1)

  topHoldings.slice(0, 4).forEach((h, i) => {
    const cx = 64 + colW * i
    const maxBarH = 110
    const totalMax = topHoldings[0]?.value || 1
    const barH = Math.max(12, (h.value / totalMax) * maxBarH)
    const barY = 358 + (maxBarH - barH)
    const barW = Math.min(colW - 40, 90)

    // Bar gradient
    const barGrad = ctx.createLinearGradient(0, barY, 0, barY + barH)
    barGrad.addColorStop(0, h.pnl >= 0 ? 'rgba(0,230,118,0.95)' : 'rgba(255,82,82,0.85)')
    barGrad.addColorStop(1, h.pnl >= 0 ? 'rgba(var(--g-rgb),0.25)' : 'rgba(200,0,0,0.2)')
    ctx.fillStyle = barGrad
    ctx.shadowColor = h.pnl >= 0 ? '#00e676' : '#ff5252'
    ctx.shadowBlur = 14
    rr(ctx, cx, barY, barW, barH, 8); ctx.fill()
    ctx.shadowBlur = 0

    // Symbol
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 18px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText((h.coin_symbol || h.symbol || h.coin_id || '?').toUpperCase().slice(0, 6), cx, barY + barH + 26)

    // Value
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(fmtUsd(h.value), cx, barY + barH + 45)

    // P&L pct
    const pnlPct = h.pnlPct ?? h.pct24h
    if (pnlPct != null) {
      ctx.fillStyle = pnlPct >= 0 ? '#00e676' : '#ff5252'
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.fillText(fmtPct(pnlPct), cx, barY + barH + 63)
    }
  })

  // ── Bottom bar ───────────────────────────────────────────────────────────
  ctx.fillStyle = accent + '10'
  ctx.fillRect(0, H - 52, W, 52)

  ctx.textAlign = 'right'
  ctx.fillStyle = accent
  ctx.font = 'bold 14px system-ui, sans-serif'
  ctx.fillText('Track yours free → walletlens.cc', W - 48, H - 20)

  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), 64, H - 20)
}

export default function ShareCard({ totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL, perfSeries, onClose }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  function download() {
    track('portfolio_share_download')
    const a = document.createElement('a')
    a.href = canvasRef.current.toDataURL('image/png')
    a.download = 'walletlens-portfolio.png'
    a.click()
  }

  async function copyImage() {
    try {
      canvasRef.current.toBlob(async blob => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true); setTimeout(() => setCopied(false), 2000)
        track('portfolio_share_copy')
      })
    } catch { download() }
  }

  const tweetText = () => {
    const pnlSign = totalPnL >= 0 ? '+' : ''
    return encodeURIComponent(
      `My crypto portfolio: ${fmtUsd(totalValue)} (${pnlSign}${fmtPct(totalPnLPct)} all-time) 📈\n\nTracked with @walletlenss — free, no account, 100% private.\n\nwalletlens.cc/?ref=share`
    )
  }

  async function shareToX() {
    if (sharing) return
    setSharing(true)
    track('portfolio_share_x')
    try {
      // Try Web Share API with image file (works on mobile)
      if (navigator.canShare) {
        const dataUrl = canvasRef.current.toDataURL('image/png')
        const res = await fetch(dataUrl)
        const blob = await res.blob()
        const file = new File([blob], 'walletlens-portfolio.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'My WalletLens Portfolio', text: decodeURIComponent(tweetText()) })
          setSharing(false); return
        }
      }
    } catch { /* fall through to desktop */ }
    // Desktop fallback: download image + open X
    download()
    setTimeout(() => window.open(`https://twitter.com/intent/tweet?text=${tweetText()}`, '_blank', 'noopener'), 400)
    setSharing(false)
  }

  return (
    <div className="share-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="share-modal">
        <div className="share-modal-header">
          <span>Share Your Portfolio</span>
          <button className="share-close" onClick={onClose}>✕</button>
        </div>

        <canvas
          ref={el => { if (el && !ready) { setTimeout(() => { drawCard(el, { totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL, perfSeries, theme: getThemeColors() }); canvasRef.current = el; setReady(true) }, 0) } }}
          className="share-canvas"
        />

        <div className="share-actions">
          <button className="share-btn share-btn-dl" onClick={download}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Save Image
          </button>
          <button className="share-btn share-btn-copy" onClick={copyImage}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {copied ? 'Copied! ✓' : 'Copy Image'}
          </button>
          <button className="share-btn share-btn-tweet" onClick={shareToX} disabled={sharing}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            {sharing ? 'Opening…' : 'Share on X'}
          </button>
        </div>

        <p className="share-hint">📱 On mobile, the image attaches directly to your post. On desktop it saves first, then opens X.</p>
      </div>
    </div>
  )
}
