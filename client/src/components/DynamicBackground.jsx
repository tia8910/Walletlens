import { useEffect, useRef } from 'react'

// Alpha buckets for batching line draw calls — quantises per-pair alpha into
// N_BUCKETS levels so we can do one ctx.stroke() per bucket instead of one
// per particle pair, cutting canvas API overhead by ~10×.
const N_BUCKETS = 8

export default function DynamicBackground({
  particleCount = 80,
  linkDistance = 130,
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
        p.vx = (Math.random() - 0.5) * 1.4
        p.vy = (Math.random() - 0.5) * 1.4
        p.size = Math.random() * 2.6 + 1.0
      }
    }

    const linkDist2 = linkDistance * linkDistance
    // Pre-allocate bucket paths to avoid per-frame allocation
    const buckets = Array.from({ length: N_BUCKETS }, () => [])

    function step() {
      ctx.clearRect(0, 0, w, h)

      // Move particles first
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        else if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        else if (p.y > h + 10) p.y = -10
      }

      // Batch connecting lines by alpha bucket to minimise ctx.stroke() calls
      ctx.lineWidth = 0.9
      for (let k = 0; k < N_BUCKETS; k++) buckets[k].length = 0

      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDist2) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            const bucket = Math.min(N_BUCKETS - 1, (alpha * N_BUCKETS) | 0)
            buckets[bucket].push(a.x, a.y, b.x, b.y)
          }
        }
      }

      for (let k = 0; k < N_BUCKETS; k++) {
        const segs = buckets[k]
        if (segs.length === 0) continue
        const alpha = ((k + 0.5) / N_BUCKETS) * 0.22
        ctx.strokeStyle = `rgba(52,211,153,${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let s = 0; s < segs.length; s += 4) {
          ctx.moveTo(segs[s], segs[s + 1])
          ctx.lineTo(segs[s + 2], segs[s + 3])
        }
        ctx.stroke()
      }

      // Particles with glow
      ctx.fillStyle = color
      ctx.shadowBlur = 18
      ctx.shadowColor = color
      ctx.beginPath()
      for (const p of particles) {
        ctx.rect(p.x, p.y, p.size, p.size)
      }
      ctx.fill()
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(step)
    }

    resize()
    seed()
    step()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
