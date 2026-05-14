import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 80,
  linkDistance = 150,
  color = '#34d399',
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    // Halve count on narrow (mobile) screens to stay smooth
    const count = window.innerWidth < 768 ? Math.ceil(particleCount / 2) : particleCount
    const linkD2 = linkDistance * linkDistance
    const FRAME_MS = 1000 / 30  // target 30fps — background is subtle, 60fps wastes CPU

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

    let lastTime = 0
    function step(now) {
      raf = requestAnimationFrame(step)
      if (now - lastTime < FRAME_MS) return  // skip frame to hold ~30fps
      lastTime = now

      ctx.clearRect(0, 0, w, h)

      // Connecting lines — batch all paths then stroke once per alpha bucket
      ctx.lineWidth = 0.9
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkD2) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            ctx.strokeStyle = `rgba(52,211,153,${(alpha * 0.22).toFixed(2)})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // Particles with reduced glow (shadowBlur 8 vs 18 — cheaper compositing)
      ctx.fillStyle = color
      ctx.shadowBlur = 8
      ctx.shadowColor = color
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
    raf = requestAnimationFrame(step)

    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [particleCount, linkDistance, color])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
