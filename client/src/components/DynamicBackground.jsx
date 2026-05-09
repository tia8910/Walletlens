import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 60,
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
    const ld2 = linkDistance * linkDistance

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

    // Reuse alpha buckets to batch line draws — same strokeStyle → one path
    const BUCKETS = 5
    const bucketPaths = Array.from({ length: BUCKETS }, () => [])

    function step() {
      ctx.clearRect(0, 0, w, h)

      // Batch connecting lines by alpha bucket to minimise strokeStyle switches
      for (let b = 0; b < BUCKETS; b++) bucketPaths[b].length = 0

      ctx.lineWidth = 0.9
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < ld2) {
            const ratio = Math.sqrt(d2) / linkDistance
            const bucket = Math.min(BUCKETS - 1, Math.floor(ratio * BUCKETS))
            bucketPaths[bucket].push(a.x, a.y, b.x, b.y)
          }
        }
      }

      for (let b = 0; b < BUCKETS; b++) {
        const segs = bucketPaths[b]
        if (segs.length === 0) continue
        const alpha = (1 - (b + 0.5) / BUCKETS) * 0.22
        ctx.strokeStyle = `rgba(52, 211, 153, ${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let k = 0; k < segs.length; k += 4) {
          ctx.moveTo(segs[k], segs[k + 1])
          ctx.lineTo(segs[k + 2], segs[k + 3])
        }
        ctx.stroke()
      }

      // Particles — no shadowBlur (it forces per-draw compositing and kills perf)
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

    resize()
    seed()
    step()

    // Only resize canvas dimensions on resize — avoid jarring position reset
    const ro = new ResizeObserver(() => resize())
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
