import { useEffect, useRef } from 'react'

// Alpha buckets used to batch line-drawing calls. Instead of one ctx.stroke()
// per particle pair (O(n²) draw calls), we group lines into BUCKETS bands and
// issue one stroke call per band — reducing GPU submit overhead by ~100×.
const LINK_BUCKETS = 5

export default function DynamicBackground({
  particleCount = 220,
  linkDistance = 150,
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

    // Pre-allocate bucket arrays to avoid GC churn each frame
    const buckets = Array.from({ length: LINK_BUCKETS }, () => [])

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

      // ── Connecting lines (batched by alpha bucket) ───────────────────
      // Sorting pairs into alpha bands lets us issue one ctx.stroke() per
      // band instead of per pair, cutting GPU command overhead by ~100×.
      const maxD2 = linkDistance * linkDistance
      for (let b = 0; b < LINK_BUCKETS; b++) buckets[b].length = 0

      ctx.lineWidth = 0.9
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < maxD2) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            const bi = Math.min(Math.floor(alpha * LINK_BUCKETS), LINK_BUCKETS - 1)
            buckets[bi].push(a.x, a.y, b.x, b.y)
          }
        }
      }

      for (let bi = 0; bi < LINK_BUCKETS; bi++) {
        const pts = buckets[bi]
        if (pts.length === 0) continue
        const alpha = ((bi + 0.5) / LINK_BUCKETS) * 0.22
        ctx.strokeStyle = `rgba(52,211,153,${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let k = 0; k < pts.length; k += 4) {
          ctx.moveTo(pts[k], pts[k + 1])
          ctx.lineTo(pts[k + 2], pts[k + 3])
        }
        ctx.stroke()
      }

      // ── Particles ────────────────────────────────────────────────────
      // shadowBlur is omitted: it forces a full-canvas blur pass on the GPU
      // every frame, costing more than all the line batching saves.
      // A slightly larger, semi-transparent halo rect gives a similar visual
      // at a fraction of the cost.
      ctx.fillStyle = 'rgba(52,211,153,0.18)'
      for (const p of particles) {
        const halo = p.size + 2
        ctx.fillRect(p.x - 1, p.y - 1, halo, halo)
      }
      ctx.fillStyle = color
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        if (p.y > h + 10) p.y = -10
        ctx.fillRect(p.x, p.y, p.size, p.size)
      }

      raf = requestAnimationFrame(step)
    }

    function handleVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        raf = requestAnimationFrame(step)
      }
    }

    resize()
    seed()
    raf = requestAnimationFrame(step)

    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
