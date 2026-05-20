import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 220,
  linkDistance = 150,
  color = null,
}) {
  const canvasRef = useRef(null)
  const reduceMotion = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduceMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Reduce particle count on narrow viewports — the O(n²) connection
    // loop is the dominant cost, so halving n cuts work by ~75%.
    const isMobile = window.innerWidth < 768
    const count = isMobile ? Math.min(particleCount, 80) : particleCount

    // CSS variable cache — reread at most once per second to avoid a
    // getComputedStyle() forced-style recalc on every animation frame.
    const colorCache = { col: '#34d399', rgb: '52,211,153', ts: 0 }
    function refreshColor() {
      const now = Date.now()
      if (now - colorCache.ts < 1000) return
      const root = document.documentElement
      colorCache.col = color || getComputedStyle(root).getPropertyValue('--g').trim() || '#34d399'
      colorCache.rgb = getComputedStyle(root).getPropertyValue('--g-rgb').trim() || '52,211,153'
      colorCache.ts = now
    }

    function resize() {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const particles = Array.from({ length: count }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, size: 0,
    }))

    function seed() {
      for (const p of particles) {
        p.x = Math.random() * w
        p.y = Math.random() * h
        p.vx = (Math.random() - 0.5) * 1.4
        p.vy = (Math.random() - 0.5) * 1.4
        p.size = Math.random() * 2.6 + 1.0
      }
    }

    // Cap rendering to ~30 fps — halves GPU/CPU load with no visible quality
    // loss for a slow-drifting decorative background.
    const FRAME_MS = 1000 / 30
    let lastFrameTs = 0

    function step(ts) {
      raf = requestAnimationFrame(step)
      if (ts - lastFrameTs < FRAME_MS) return
      lastFrameTs = ts

      refreshColor()
      const { rgb, col } = colorCache

      ctx.clearRect(0, 0, w, h)

      // Sharp connecting lines
      ctx.lineWidth = 0.9
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDistance * linkDistance) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            ctx.strokeStyle = `rgba(${rgb}, ${alpha * 0.22})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // Sharp rectangular particles with glow
      ctx.fillStyle = col
      ctx.shadowBlur = 12
      ctx.shadowColor = col
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10
        ctx.fillRect(p.x, p.y, p.size, p.size)
      }
      ctx.shadowBlur = 0
    }

    resize()
    seed()
    refreshColor()

    // Pause the animation loop while the tab is hidden so we don't burn
    // CPU/battery in the background.
    function handleVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        lastFrameTs = 0
        raf = requestAnimationFrame(step)
      }
    }

    if (!document.hidden) {
      raf = requestAnimationFrame(step)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
