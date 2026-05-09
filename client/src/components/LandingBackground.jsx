import { useEffect, useRef } from 'react'

// Renders on a full-page canvas behind the landing page:
// – Slow-drifting radial aurora blobs (green/blue/purple)
// – Subtle dot grid that parallax-shifts with scroll
// – Shooting-star streaks that arc across the canvas periodically
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
    let w = 0, h = 0, raf = 0, scrollY = 0

    function resize() {
      w = window.innerWidth
      h = document.documentElement.scrollHeight || window.innerHeight
      canvas.style.width  = window.innerWidth + 'px'
      canvas.style.height = document.documentElement.scrollHeight + 'px'
      canvas.width  = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // ── Aurora blobs ────────────────────────────────────────────────────
    const blobs = [
      { x: 0.15, y: 0.08, r: 0.38, color: 'rgba(52,211,153,',  speed: 0.00007, phase: 0 },
      { x: 0.82, y: 0.22, r: 0.30, color: 'rgba(59,130,246,',  speed: 0.00009, phase: 2.1 },
      { x: 0.50, y: 0.55, r: 0.44, color: 'rgba(139,92,246,',  speed: 0.00006, phase: 4.3 },
      { x: 0.10, y: 0.75, r: 0.28, color: 'rgba(16,185,129,',  speed: 0.00008, phase: 1.1 },
      { x: 0.85, y: 0.68, r: 0.32, color: 'rgba(52,211,153,',  speed: 0.00005, phase: 3.5 },
    ]

    // ── Shooting stars ──────────────────────────────────────────────────
    const STARS_MAX = 3
    const stars = []
    function spawnStar() {
      if (stars.length >= STARS_MAX) return
      const side = Math.random() < 0.5 ? 0 : 1 // 0=top, 1=left
      const sx = side === 1 ? -20 : Math.random() * w
      const sy = side === 0 ? -20 : Math.random() * (h * 0.6)
      const angle = (Math.random() * 30 + 25) * (Math.PI / 180)
      const speed = 4 + Math.random() * 5
      stars.push({
        x: sx, y: sy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 120 + Math.random() * 160,
        alpha: 0,
        life: 0,
        maxLife: 80 + Math.random() * 60,
      })
    }

    let lastStarSpawn = 0
    const STAR_INTERVAL = 3000 // ms

    // ── Dot grid ────────────────────────────────────────────────────────
    const DOT_SPACING = 36

    function draw(ts) {
      ctx.clearRect(0, 0, w, h)

      // dot grid (very subtle)
      const scrollOff = scrollY * 0.06
      ctx.fillStyle = 'rgba(52,211,153,0.07)'
      const cols = Math.ceil(w / DOT_SPACING) + 2
      const rows = Math.ceil(h / DOT_SPACING) + 2
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const x = c * DOT_SPACING - (scrollOff % DOT_SPACING)
          const y = r * DOT_SPACING
          ctx.beginPath()
          ctx.arc(x, y, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // aurora blobs
      for (const b of blobs) {
        const drift = Math.sin(ts * b.speed + b.phase)
        const bx = (b.x + drift * 0.06) * w
        const by = (b.y + Math.cos(ts * b.speed * 0.7 + b.phase) * 0.05) * h
        const br = b.r * Math.min(w, h)
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br)
        g.addColorStop(0, b.color + '0.18)')
        g.addColorStop(0.5, b.color + '0.06)')
        g.addColorStop(1,   b.color + '0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(bx, by, br, 0, Math.PI * 2)
        ctx.fill()
      }

      // shooting stars
      if (ts - lastStarSpawn > STAR_INTERVAL) {
        spawnStar(); lastStarSpawn = ts
      }
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]
        s.life++
        s.alpha = s.life < 10 ? s.life / 10 : s.life > s.maxLife - 15 ? (s.maxLife - s.life) / 15 : 1
        s.x += s.vx; s.y += s.vy
        const tailX = s.x - s.vx * (s.len / (s.vx || 1))
        const tailY = s.y - s.vy * (s.len / (s.vy || 1))
        const g = ctx.createLinearGradient(tailX, tailY, s.x, s.y)
        g.addColorStop(0, `rgba(255,255,255,0)`)
        g.addColorStop(0.7, `rgba(52,211,153,${s.alpha * 0.4})`)
        g.addColorStop(1,   `rgba(255,255,255,${s.alpha * 0.9})`)
        ctx.strokeStyle = g
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(tailX, tailY)
        ctx.lineTo(s.x, s.y)
        ctx.stroke()
        // head glow
        ctx.fillStyle = `rgba(255,255,255,${s.alpha * 0.95})`
        ctx.shadowColor = '#34d399'
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (s.life >= s.maxLife || s.x > w + 200 || s.y > h + 200) {
          stars.splice(i, 1)
        }
      }

      raf = requestAnimationFrame(draw)
    }

    function onScroll() { scrollY = window.scrollY }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
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
