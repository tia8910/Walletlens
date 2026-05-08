import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 90,
  linkDistance = 140,
  color = '#34d399',
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

    function resize() {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const particles = Array.from({ length: particleCount }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, size: 0,
    }))

    function seed() {
      for (const p of particles) {
        p.x = Math.random() * w
        p.y = Math.random() * h
        p.vx = (Math.random() - 0.5) * 0.45
        p.vy = (Math.random() - 0.5) * 0.45
        p.size = Math.random() * 1.6 + 0.6
      }
    }

    function step() {
      ctx.clearRect(0, 0, w, h)

      // Lines between near particles (neural/circuit feel)
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDistance * linkDistance) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            ctx.strokeStyle = `rgba(52, 211, 153, ${alpha * 0.18})`
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      // Particles
      ctx.fillStyle = color
      ctx.shadowBlur = 12
      ctx.shadowColor = color
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(step)
    }

    resize()
    seed()
    step()

    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
