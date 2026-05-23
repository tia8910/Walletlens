import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 100,
  linkDistance = 140,
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
    const D2 = linkDistance * linkDistance

    // Read CSS vars once and update via MutationObserver instead of
    // calling getComputedStyle on every animation frame (was 120 calls/sec).
    let col = '#34d399'
    let rgb = '52,211,153'
    function readColors() {
      const style = getComputedStyle(document.documentElement)
      col = color ?? (style.getPropertyValue('--g').trim() || '#34d399')
      rgb = style.getPropertyValue('--g-rgb').trim() || '52,211,153'
    }
    readColors()
    const mo = new MutationObserver(readColors)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })

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
        p.vx = (Math.random() - 0.5) * 1.4
        p.vy = (Math.random() - 0.5) * 1.4
        p.size = Math.random() * 2.6 + 1.0
      }
    }

    function step() {
      ctx.clearRect(0, 0, w, h)

      // Batch ALL connecting lines into one beginPath/stroke call.
      // Previously: O(n²) individual stroke() calls ≈ 24,000/frame with 220 particles.
      // Now: 1 stroke() call regardless of particle count.
      ctx.strokeStyle = `rgba(${rgb}, 0.14)`
      ctx.lineWidth = 0.9
      ctx.beginPath()
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          if (dx * dx + dy * dy < D2) {
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
          }
        }
      }
      ctx.stroke()

      // Particles
      ctx.fillStyle = col
      ctx.shadowBlur = 18
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

      raf = requestAnimationFrame(step)
    }

    // Stop the RAF loop entirely when the tab is hidden; restart when visible.
    function handleVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        raf = requestAnimationFrame(step)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    resize()
    seed()
    step()

    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
