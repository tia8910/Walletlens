import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 120,
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
    let running = true
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

    // Pre-parse hex color once so rgba() strings can be built without repeated hex parsing
    const rC = parseInt(color.slice(1, 3), 16)
    const gC = parseInt(color.slice(3, 5), 16)
    const bC = parseInt(color.slice(5, 7), 16)
    const rgb = `${rC},${gC},${bC}`

    // Batch line segments into alpha buckets to reduce stroke() calls from O(n²) to O(buckets)
    const BUCKETS = 6
    const buckets = Array.from({ length: BUCKETS }, () => [])
    const linkDist2 = linkDistance * linkDistance

    function step() {
      ctx.clearRect(0, 0, w, h)

      for (let b = 0; b < BUCKETS; b++) buckets[b].length = 0

      // Collect connecting line segments, sorted into alpha buckets
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const p = particles[j]
          const dx = a.x - p.x
          const dy = a.y - p.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDist2) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            const bIdx = Math.min(BUCKETS - 1, (alpha * BUCKETS) | 0)
            const bkt = buckets[bIdx]
            bkt.push(a.x, a.y, p.x, p.y)
          }
        }
      }

      // One beginPath+stroke per bucket instead of per line segment
      ctx.lineWidth = 0.9
      for (let bIdx = 0; bIdx < BUCKETS; bIdx++) {
        const segs = buckets[bIdx]
        if (segs.length === 0) continue
        const alpha = (((bIdx + 0.5) / BUCKETS) * 0.22).toFixed(3)
        ctx.strokeStyle = `rgba(${rgb},${alpha})`
        ctx.beginPath()
        for (let k = 0; k < segs.length; k += 4) {
          ctx.moveTo(segs[k], segs[k + 1])
          ctx.lineTo(segs[k + 2], segs[k + 3])
        }
        ctx.stroke()
      }

      // Move and draw particles — no shadowBlur (expensive GPU state change per rect)
      ctx.fillStyle = color
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        else if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        else if (p.y > h + 10) p.y = -10
        ctx.fillRect(p.x, p.y, p.size, p.size)
      }

      if (running) raf = requestAnimationFrame(step)
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (running && raf === 0) {
        raf = requestAnimationFrame(step)
      }
    }

    resize()
    seed()
    step()

    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [particleCount, linkDistance, color, reduceMotion])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
