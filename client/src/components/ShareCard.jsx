import { useRef, useState } from 'react'

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

function drawCard(canvas, { totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL }) {
  const W = 1200, H = 630, dpr = 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  // ── Background ──────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#020f07')
  bg.addColorStop(0.6, '#041208')
  bg.addColorStop(1, '#071a0c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle radial glow top-left
  const glow = ctx.createRadialGradient(200, 120, 0, 200, 120, 480)
  glow.addColorStop(0, 'rgba(0,200,83,0.12)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ── Grid lines ──────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(0,200,83,0.04)'
  ctx.lineWidth = 1
  for (let i = 1; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(0, H / 6 * i); ctx.lineTo(W, H / 6 * i); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 6 * i, 0); ctx.lineTo(W / 6 * i, H); ctx.stroke()
  }

  // ── Border ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(0,200,83,0.18)'
  ctx.lineWidth = 1.5
  rr(ctx, 1, 1, W - 2, H - 2, 24)
  ctx.stroke()

  // ── WalletLens logo lens ─────────────────────────────────────────────────
  const lx = 64, ly = 52
  ctx.strokeStyle = '#00c853'
  ctx.lineWidth = 3.5
  ctx.beginPath(); ctx.arc(lx, ly, 20, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#00c853'
  ctx.beginPath(); ctx.arc(lx + 3, ly + 3, 9, 0, Math.PI * 2); ctx.fill()
  // handle
  ctx.strokeStyle = '#00c853'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(lx + 14, ly + 14); ctx.lineTo(lx + 23, ly + 23); ctx.stroke()

  // ── WalletLens wordmark ──────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 22px "Cabinet Grotesk", system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('WalletLens', lx + 32, ly + 8)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('walletlens.cc', lx + 32, ly + 26)

  // ── Tagline (top right) ──────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,200,83,0.6)'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('Zoom in your wealth', W - 48, 52)

  // ── Divider ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(48, 88); ctx.lineTo(W - 48, 88); ctx.stroke()

  // ── Total value ───────────────────────────────────────────────────────────
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '15px system-ui, sans-serif'
  ctx.fillText('TOTAL PORTFOLIO', 64, 132)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px "Cabinet Grotesk", system-ui, sans-serif'
  ctx.fillText(fmtUsd(totalValue), 64, 210)

  // ── P&L pill ─────────────────────────────────────────────────────────────
  const pnlPositive = totalPnL >= 0
  const pnlColor = pnlPositive ? '#00e676' : '#ff5252'
  const pnlBg = pnlPositive ? 'rgba(0,230,118,0.14)' : 'rgba(255,82,82,0.14)'
  const pnlText = (pnlPositive ? '+' : '') + fmtUsd(totalPnL) + '  ' + fmtPct(totalPnLPct)
  ctx.font = 'bold 22px system-ui, sans-serif'
  const pnlW = ctx.measureText(pnlText).width + 32
  ctx.fillStyle = pnlBg
  rr(ctx, 64, 228, pnlW, 42, 10)
  ctx.fill()
  ctx.fillStyle = pnlColor
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(pnlText, 80, 255)

  // ── Today P&L label ────────────────────────────────────────────────────
  if (todayPnL != null) {
    const todayPos = todayPnL >= 0
    const todayColor = todayPos ? '#69f0ae' : '#ff8a80'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText('Today', 64 + pnlW + 16, 247)
    ctx.fillStyle = todayColor
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText((todayPos ? '+' : '') + fmtUsd(todayPnL), 64 + pnlW + 60, 247)
  }

  // ── Divider ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(48, 300); ctx.lineTo(W - 48, 300); ctx.stroke()

  // ── Top holdings ─────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '14px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('TOP HOLDINGS', 64, 336)

  const cols = Math.min(topHoldings.length, 4)
  const colW = (W - 96) / Math.max(cols, 1)

  topHoldings.slice(0, 4).forEach((h, i) => {
    const cx = 64 + colW * i
    const maxBarH = 120
    const totalMax = topHoldings[0]?.value || 1
    const barH = Math.max(8, (h.value / totalMax) * maxBarH)
    const barY = 360 + (maxBarH - barH)
    const barW = Math.min(colW - 32, 80)

    // Bar
    const barGrad = ctx.createLinearGradient(0, barY, 0, barY + barH)
    barGrad.addColorStop(0, h.pnl >= 0 ? 'rgba(0,230,118,0.9)' : 'rgba(255,82,82,0.8)')
    barGrad.addColorStop(1, h.pnl >= 0 ? 'rgba(0,230,118,0.3)' : 'rgba(255,82,82,0.25)')
    ctx.fillStyle = barGrad
    rr(ctx, cx, barY, barW, barH, 6)
    ctx.fill()

    // Glow
    ctx.shadowColor = h.pnl >= 0 ? '#00e676' : '#ff5252'
    ctx.shadowBlur = 12
    rr(ctx, cx, barY, barW, barH, 6)
    ctx.fill()
    ctx.shadowBlur = 0

    // Symbol
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 16px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText((h.symbol || h.coin_id || '?').toUpperCase().slice(0, 5), cx, barY + barH + 22)

    // Value
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '12px system-ui, sans-serif'
    ctx.fillText(fmtUsd(h.value), cx, barY + barH + 40)

    // Pct change
    const pct = h.pct24h
    if (pct != null) {
      ctx.fillStyle = pct >= 0 ? '#00e676' : '#ff5252'
      ctx.font = 'bold 12px system-ui, sans-serif'
      ctx.fillText(fmtPct(pct), cx, barY + barH + 57)
    }
  })

  // ── Bottom watermark / CTA ───────────────────────────────────────────────
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(0,200,83,0.5)'
  ctx.font = '13px system-ui, sans-serif'
  ctx.fillText('Track yours free → walletlens.cc', W - 48, H - 28)

  // Date stamp
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), 64, H - 28)
}

export default function ShareCard({ totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL, onClose }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)

  function generate() {
    if (!canvasRef.current) return
    drawCard(canvasRef.current, { totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL })
    setReady(true)
  }

  function download() {
    const a = document.createElement('a')
    a.href = canvasRef.current.toDataURL('image/png')
    a.download = 'walletlens-portfolio.png'
    a.click()
  }

  async function copyImage() {
    try {
      canvasRef.current.toBlob(async blob => {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    } catch { download() }
  }

  function tweet() {
    const pnlSign = totalPnL >= 0 ? '+' : ''
    const text = encodeURIComponent(
      `My portfolio is at ${fmtUsd(totalValue)} (${pnlSign}${fmtPct(totalPnLPct)} all-time) 📈\n\nTracked with WalletLens — free, no account, private.\n\nwalletlens.cc`
    )
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener')
  }

  // Generate on first render
  if (!ready && canvasRef.current) generate()

  return (
    <div className="share-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="share-modal">
        <div className="share-modal-header">
          <span>Share Your Portfolio</span>
          <button className="share-close" onClick={onClose}>✕</button>
        </div>

        <canvas
          ref={el => { if (el && !ready) { setTimeout(() => { drawCard(el, { totalValue, totalPnL, totalPnLPct, topHoldings, todayPnL }); setReady(true) }, 0) } }}
          className="share-canvas"
        />

        <div className="share-actions">
          <button className="share-btn share-btn-dl" onClick={download}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Save Image
          </button>
          <button className="share-btn share-btn-copy" onClick={copyImage}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {copied ? 'Copied!' : 'Copy Image'}
          </button>
          <button className="share-btn share-btn-tweet" onClick={tweet}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Share on X
          </button>
        </div>

        <p className="share-hint">Share your gains and let others discover WalletLens 🚀</p>
      </div>
    </div>
  )
}
