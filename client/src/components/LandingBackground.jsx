import { useEffect, useRef } from 'react'

// "Living Net Worth" landing background — LIGHT theme, on-brand & premium.
// Layers (back → front):
//  1. Soft mint-white brand gradient base + faint radial glow
//  2. Pastel aurora orbs slowly drifting (premium depth)
//  3. Two parallax "equity curve" lines flowing & trending upward with a
//     green gradient area fill (your net worth growing)
//  4. A live pulse dot riding the front curve's leading edge
//  5. Floating gain labels (+$ / +%) that rise and fade
//  6. Soft light scrim so dark text stays crystal clear
// Respects prefers-reduced-motion and pauses when the tab is hidden.
export default function LandingBackground() {
  const canvasRef = useRef(null)
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0, t = 0, mobile = false

    function resize() {
      w = window.innerWidth
      h = window.innerHeight
      mobile = w < 640
      canvas.width  = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width  = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // ── Soft mint-white brand base ──────────────────────────────────────────
    function paintBase() {
      const g = ctx.createLinearGradient(0, 0, w * 0.4, h)
      g.addColorStop(0,   '#f1f8f4')
      g.addColorStop(0.5, '#e9f3ee')
      g.addColorStop(1,   '#dfeee7')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      // Faint brand glow from the top
      const rg = ctx.createRadialGradient(w * 0.5, h * 0.08, 0, w * 0.5, h * 0.08, h * 0.7)
      rg.addColorStop(0, 'rgba(16,185,129,0.10)')
      rg.addColorStop(1, 'rgba(16,185,129,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, w, h)
    }

    // ── Aurora orbs (pastel, normal blend so they read on light) ────────────
    const ORB_COLORS = [
      [16, 185, 129],   // emerald
      [45, 212, 191],   // teal
      [56, 189, 248],   // sky
      [132, 204, 22],   // lime
    ]
    let orbs = []
    function makeOrbs() {
      const count = mobile ? 3 : 5
      orbs = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.9,
        r: (mobile ? 170 : 280) + Math.random() * (mobile ? 120 : 220),
        c: ORB_COLORS[i % ORB_COLORS.length],
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.18,
        phase: Math.random() * Math.PI * 2,
      }))
    }
    function drawOrbs() {
      for (const o of orbs) {
        o.x += o.vx; o.y += o.vy; o.phase += 0.01
        if (o.x < -o.r) o.x = w + o.r; if (o.x > w + o.r) o.x = -o.r
        if (o.y < -o.r) o.y = h + o.r; if (o.y > h + o.r) o.y = -o.r
        const pulse = 0.09 + Math.sin(o.phase) * 0.03
        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r)
        grad.addColorStop(0, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},${pulse})`)
        grad.addColorStop(1, `rgba(${o.c[0]},${o.c[1]},${o.c[2]},0)`)
        ctx.fillStyle = grad
        ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2)
      }
    }

    // ── Equity curves ───────────────────────────────────────────────────────
    function curveY(x, time, layer) {
      const nx = x / w
      const trend = -nx * h * (layer === 0 ? 0.11 : 0.07)
      const a1 = Math.sin(nx * 6 + time * (layer === 0 ? 1 : 0.6)) * (mobile ? 22 : 34)
      const a2 = Math.sin(nx * 13 - time * (layer === 0 ? 1.6 : 1)) * (mobile ? 10 : 16)
      const a3 = Math.sin(nx * 3 + time * 0.4) * (mobile ? 16 : 26)
      const base = layer === 0 ? h * 0.86 : h * 0.93
      return base + trend + a1 + a2 + a3
    }

    function drawCurve(layer, time) {
      const step = mobile ? 14 : 9
      const pts = []
      for (let x = 0; x <= w + step; x += step) pts.push([x, curveY(x, time, layer)])

      // Area fill
      const fill = ctx.createLinearGradient(0, h * 0.5, 0, h)
      const c = layer === 0 ? '16,185,129' : '45,212,191'
      fill.addColorStop(0, `rgba(${c},${layer === 0 ? 0.16 : 0.10})`)
      fill.addColorStop(1, `rgba(${c},0)`)
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = fill
      ctx.fill()

      // Glowing stroke
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.strokeStyle = layer === 0 ? 'rgba(5,150,105,0.85)' : 'rgba(13,148,136,0.45)'
      ctx.lineWidth = layer === 0 ? (mobile ? 2.2 : 3) : 1.6
      ctx.shadowColor = layer === 0 ? '#10b981' : '#2dd4bf'
      ctx.shadowBlur = layer === 0 ? (mobile ? 8 : 14) : 6
      ctx.stroke()
      ctx.shadowBlur = 0

      return pts
    }

    // ── Floating gain labels ────────────────────────────────────────────────
    let labels = []
    function maybeSpawnLabel(frontPts) {
      const cap = mobile ? 4 : 7
      if (labels.length >= cap) return
      if (Math.random() > (mobile ? 0.018 : 0.03)) return
      const idx = Math.floor(Math.random() * frontPts.length)
      const [x, y] = frontPts[idx]
      const gold = Math.random() < 0.18
      const isPct = Math.random() < 0.5
      const text = isPct
        ? `+${(Math.random() * 9 + 0.4).toFixed(1)}%`
        : `+$${(Math.random() * 4800 + 120).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      labels.push({ x, y, text, alpha: 0, vy: 0.5 + Math.random() * 0.4, life: 0,
        color: gold ? '#b8860b' : '#047857' })
    }
    function drawLabels() {
      ctx.textAlign = 'center'
      ctx.font = `bold ${mobile ? 12 : 14}px "Plus Jakarta Sans", system-ui, sans-serif`
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i]
        l.life += 1
        l.y -= l.vy
        l.alpha = l.life < 20 ? l.life / 20 : Math.max(0, 1 - (l.life - 20) / 90)
        if (l.alpha <= 0) { labels.splice(i, 1); continue }
        ctx.globalAlpha = l.alpha * 0.85
        ctx.fillStyle = l.color
        ctx.fillText(l.text, l.x, l.y)
        ctx.globalAlpha = 1
      }
    }

    // ── Soft light scrim for text readability ───────────────────────────────
    function drawScrim() {
      const s = ctx.createLinearGradient(0, 0, 0, h)
      s.addColorStop(0,    'rgba(244,250,247,0.35)')
      s.addColorStop(0.4,  'rgba(244,250,247,0.5)')
      s.addColorStop(0.66, 'rgba(244,250,247,0.32)')
      s.addColorStop(1,    'rgba(244,250,247,0)')
      ctx.fillStyle = s
      ctx.fillRect(0, 0, w, h)
    }

    function renderStatic() {
      paintBase(); drawOrbs(); drawCurve(1, 0); drawCurve(0, 0); drawScrim()
    }

    function draw() {
      t += 0.006
      paintBase()
      drawOrbs()
      drawCurve(1, t)
      const front = drawCurve(0, t)

      const tip = front[front.length - 2] || front[front.length - 1]
      if (tip) {
        const pr = 4 + Math.sin(t * 6) * 1.5
        ctx.beginPath()
        ctx.arc(tip[0], tip[1], pr, 0, Math.PI * 2)
        ctx.fillStyle = '#10b981'
        ctx.shadowColor = '#10b981'
        ctx.shadowBlur = 16
        ctx.fill()
        ctx.shadowBlur = 0
      }

      maybeSpawnLabel(front)
      drawLabels()
      drawScrim()
      raf = requestAnimationFrame(draw)
    }

    resize()
    makeOrbs()
    if (reduceMotion) renderStatic()
    else raf = requestAnimationFrame(draw)

    function onResize() { resize(); makeOrbs(); if (reduceMotion) renderStatic() }
    function onVisibility() {
      if (reduceMotion) return
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (!raf) raf = requestAnimationFrame(draw)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduceMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}
