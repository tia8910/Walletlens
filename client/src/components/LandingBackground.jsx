import { useEffect, useRef } from 'react'

// Bull-run candle explosion background
// – Candles shoot up from the bottom at staggered intervals
// – Each candle has body + wick + glow halo
// – On peak: particle burst + floating +% label
// – Background has a subtle dark-green vignette gradient
export default function LandingBackground() {
  const canvasRef = useRef(null)
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduceMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0

    function resize() {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width  = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width  = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // ── Candle factory ──────────────────────────────────────────────────
    const COLUMNS   = 18      // how many candle slots across the screen
    const COLORS    = [
      { body: '#00e676', glow: 'rgba(0,230,118,',   text: '#00e676' },
      { body: '#69f0ae', glow: 'rgba(105,240,174,', text: '#69f0ae' },
      { body: '#1de9b6', glow: 'rgba(29,233,182,',  text: '#1de9b6' },
      { body: '#b9f6ca', glow: 'rgba(185,246,202,', text: '#ccffd8' },
      { body: '#ffd700', glow: 'rgba(255,215,0,',   text: '#ffd700' }, // gold accent candle (rare)
    ]

    function rndColor(isGold = false) {
      if (isGold) return COLORS[4]
      return COLORS[Math.floor(Math.random() * 4)]
    }

    function makeCandle(slotIdx) {
      const isGold    = Math.random() < 0.07          // ~7% chance gold candle
      const col       = rndColor(isGold)
      const colW      = w / COLUMNS
      const jitter    = (Math.random() - 0.5) * colW * 0.5
      const x         = colW * slotIdx + colW / 2 + jitter
      const bodyW     = colW * (0.35 + Math.random() * 0.25)
      const targetH   = h * (0.25 + Math.random() * 0.65) // how tall the candle grows
      const speed     = 2.5 + Math.random() * 5           // px/frame rise speed
      const wickH     = targetH * (0.08 + Math.random() * 0.15)
      const pctLabel  = `+${(Math.random() * 18 + 1).toFixed(1)}%`
      return {
        x, bodyW, targetH, speed, wickH,
        col, pctLabel, isGold,
        currentH: 0,        // grows from 0
        phase: 'rising',    // rising | exploding | fading
        alpha: 1,
        particles: [],
        labelY: 0,
        labelAlpha: 0,
        glowPulse: Math.random() * Math.PI * 2,
        delay: Math.random() * 60,  // frame delay before starting
      }
    }

    // ── Particle factory ────────────────────────────────────────────────
    function spawnParticles(c) {
      const tipY = h - c.currentH
      const count = 28 + Math.floor(Math.random() * 20)
      for (let i = 0; i < count; i++) {
        const angle  = Math.random() * Math.PI * 2
        const speed  = 1.5 + Math.random() * 4.5
        const size   = 1.5 + Math.random() * 3.5
        const gold   = c.isGold || Math.random() < 0.15
        c.particles.push({
          x: c.x, y: tipY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.5,   // bias upward
          size,
          alpha: 1,
          decay: 0.015 + Math.random() * 0.02,
          color: gold ? '#ffd700' : c.col.body,
        })
      }
      c.labelY     = tipY - 12
      c.labelAlpha = 1
    }

    // ── Candle pool ──────────────────────────────────────────────────────
    const candles = []
    // Pre-populate every slot with one candle so the screen fills immediately
    for (let i = 0; i < COLUMNS; i++) {
      candles.push(makeCandle(i))
    }

    let frame = 0

    // ── Draw a single candle ────────────────────────────────────────────
    function drawCandle(c) {
      if (c.phase === 'fading' && c.alpha <= 0) return

      const tipY  = h - c.currentH
      const baseY = h

      // Glow halo
      const gSize = c.bodyW * (2.5 + Math.sin(c.glowPulse) * 0.5)
      const glowIntensity = c.isGold ? 0.25 : 0.18
      const grad = ctx.createRadialGradient(c.x, tipY, 0, c.x, tipY, gSize)
      grad.addColorStop(0,   c.col.glow + (glowIntensity * c.alpha) + ')')
      grad.addColorStop(0.4, c.col.glow + (glowIntensity * 0.4 * c.alpha) + ')')
      grad.addColorStop(1,   c.col.glow + '0)')
      ctx.fillStyle = grad
      ctx.fillRect(c.x - gSize, tipY - gSize * 0.5, gSize * 2, gSize * 2)

      // Wick
      const wickTop = tipY - Math.min(c.wickH, c.currentH * 0.12)
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * c.alpha})`
      ctx.lineWidth   = 1.2
      ctx.beginPath()
      ctx.moveTo(c.x, tipY)
      ctx.lineTo(c.x, Math.max(wickTop, 0))
      ctx.stroke()

      // Body — gradient green (bright top, darker base)
      const bodyGrad = ctx.createLinearGradient(0, tipY, 0, baseY)
      bodyGrad.addColorStop(0,   hexAlpha(c.col.body, 0.95 * c.alpha))
      bodyGrad.addColorStop(0.5, hexAlpha(c.col.body, 0.75 * c.alpha))
      bodyGrad.addColorStop(1,   hexAlpha(c.col.body, 0.3 * c.alpha))
      ctx.fillStyle   = bodyGrad
      ctx.shadowColor = c.col.body
      ctx.shadowBlur  = c.isGold ? 18 : 10
      const bx = c.x - c.bodyW / 2
      const bh = c.currentH
      roundRect(ctx, bx, tipY, c.bodyW, bh, Math.min(c.bodyW * 0.25, 6))
      ctx.fill()
      ctx.shadowBlur  = 0

      // Top shine
      const shineGrad = ctx.createLinearGradient(bx, tipY, bx + c.bodyW, tipY)
      shineGrad.addColorStop(0,   'rgba(255,255,255,0)')
      shineGrad.addColorStop(0.4, `rgba(255,255,255,${0.18 * c.alpha})`)
      shineGrad.addColorStop(1,   'rgba(255,255,255,0)')
      ctx.fillStyle = shineGrad
      roundRect(ctx, bx, tipY, c.bodyW, Math.min(bh * 0.3, 12), Math.min(c.bodyW * 0.25, 6))
      ctx.fill()
    }

    function hexAlpha(hex, alpha) {
      // Convert "#rrggbb" to rgba
      const r = parseInt(hex.slice(1,3), 16)
      const g = parseInt(hex.slice(3,5), 16)
      const b = parseInt(hex.slice(5,7), 16)
      return `rgba(${r},${g},${b},${alpha.toFixed(3)})`
    }

    function roundRect(ctx, x, y, width, height, r) {
      if (height <= 0) return
      r = Math.min(r, height / 2, width / 2)
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + width - r, y)
      ctx.quadraticCurveTo(x + width, y, x + width, y + r)
      ctx.lineTo(x + width, y + height)
      ctx.lineTo(x, y + height)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    // ── Main loop ────────────────────────────────────────────────────────
    function draw() {
      frame++

      // Dark background with subtle gradient
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0,   '#020f07')
      bg.addColorStop(0.5, '#030d0a')
      bg.addColorStop(1,   '#010805')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      for (let i = candles.length - 1; i >= 0; i--) {
        const c = candles[i]

        // Delay before starting
        if (c.delay > 0) { c.delay--; continue }

        c.glowPulse += 0.04

        if (c.phase === 'rising') {
          c.currentH = Math.min(c.currentH + c.speed, c.targetH)
          drawCandle(c)
          if (c.currentH >= c.targetH) {
            c.phase = 'exploding'
            spawnParticles(c)
          }
        }

        if (c.phase === 'exploding') {
          drawCandle(c)

          // Draw particles
          for (let p = c.particles.length - 1; p >= 0; p--) {
            const pt = c.particles[p]
            pt.x  += pt.vx
            pt.y  += pt.vy
            pt.vy += 0.12     // gravity
            pt.alpha -= pt.decay
            if (pt.alpha <= 0) { c.particles.splice(p, 1); continue }
            ctx.globalAlpha = pt.alpha
            ctx.fillStyle   = pt.color
            ctx.shadowColor = pt.color
            ctx.shadowBlur  = 6
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2)
            ctx.fill()
            ctx.shadowBlur = 0
            ctx.globalAlpha = 1
          }

          // Floating % label
          if (c.labelAlpha > 0) {
            c.labelY     -= 0.8
            c.labelAlpha -= 0.012
            ctx.globalAlpha = Math.max(0, c.labelAlpha)
            ctx.font        = `bold ${c.isGold ? 15 : 13}px "Inter", sans-serif`
            ctx.fillStyle   = c.col.text
            ctx.shadowColor = c.col.body
            ctx.shadowBlur  = 8
            ctx.textAlign   = 'center'
            ctx.fillText(c.pctLabel, c.x, c.labelY)
            ctx.shadowBlur = 0
            ctx.globalAlpha = 1
          }

          // Once all particles gone + label faded, start fading candle
          if (c.particles.length === 0 && c.labelAlpha <= 0) {
            c.phase = 'fading'
          }
        }

        if (c.phase === 'fading') {
          c.alpha -= 0.012
          if (c.alpha > 0) drawCandle(c)
          else {
            // Respawn this candle slot
            const slotIdx = Math.round(c.x / (w / COLUMNS))
            candles[i] = makeCandle(Math.max(0, Math.min(COLUMNS - 1, slotIdx)))
          }
        }
      }

      // Vignette overlay
      const vig = ctx.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.9)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, w, h)

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', () => { resize() })
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
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
