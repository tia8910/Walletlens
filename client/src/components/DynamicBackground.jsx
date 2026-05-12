import { useEffect, useRef } from 'react'

// Alpha buckets for batched stroke calls — reduces from O(n²) individual
// ctx.stroke() calls to a fixed constant per frame regardless of particle count.
const ALPHA_BUCKETS = [0.05, 0.09, 0.13, 0.18, 0.22]
const FRAME_INTERVAL = 1000 / 30 // cap at 30 fps — background doesn't need 60

export default function DynamicBackground({
  particleCount = 100,
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
    let lastTime = 0
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
        p.vx = (Math.random() - 0.5) * 1.4
        p.vy = (Math.random() - 0.5) * 1.4
        p.size = Math.random() * 2.6 + 1.0
      }
    }

    const linkDist2 = linkDistance * linkDistance

    function step(now) {
      raf = requestAnimationFrame(step)
      if (now - lastTime < FRAME_INTERVAL) return
      lastTime = now

      ctx.clearRect(0, 0, w, h)

      // Batch lines into alpha buckets to replace O(n²) ctx.stroke() calls
      // with a fixed number of strokes per frame (one per bucket).
      ctx.lineWidth = 0.9
      const bucketCount = ALPHA_BUCKETS.length

      // Each bucket accumulates path segments; we stroke once per bucket.
      const bucketPaths = Array.from({ length: bucketCount }, () => [])

      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDist2) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            // Map alpha (0–1) to nearest bucket index
            const bi = Math.min(bucketCount - 1, Math.floor(alpha * bucketCount))
            bucketPaths[bi].push(a.x, a.y, b.x, b.y)
          }
        }
      }

      for (let bi = 0; bi < bucketCount; bi++) {
        const segs = bucketPaths[bi]
        if (segs.length === 0) continue
        ctx.strokeStyle = `rgba(52, 211, 153, ${ALPHA_BUCKETS[bi]})`
        ctx.beginPath()
        for (let k = 0; k < segs.length; k += 4) {
          ctx.moveTo(segs[k], segs[k + 1])
          ctx.lineTo(segs[k + 2], segs[k + 3])
        }
        ctx.stroke()
      }

      // Particles with glow
      ctx.fillStyle = color
      ctx.shadowBlur = 18
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
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
