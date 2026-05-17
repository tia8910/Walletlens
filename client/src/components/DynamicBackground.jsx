import { useEffect, useRef } from 'react'

// Pre-allocated line segment buffers per alpha bucket — reused every frame
// to avoid GC pressure from fresh array allocation at 60fps.
const BUCKETS = 4

export default function DynamicBackground({
  particleCount = 160,
  linkDistance = 150,
  color = '#34d399',
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (mql?.matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0
    let active = false
    let w = 0, h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const linkDistSq = linkDistance * linkDistance

    // Persistent segment buffers (reset each frame, no GC)
    const lineBuffers = Array.from({ length: BUCKETS }, () => [])

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

      // Reset per-bucket segment buffers
      for (let b = 0; b < BUCKETS; b++) lineBuffers[b].length = 0

      // Bin lines into alpha buckets — one ctx.stroke() per bucket instead
      // of one per pair, cutting draw calls from O(n²) to a fixed constant.
      const n = particles.length
      for (let i = 0; i < n; i++) {
        const a = particles[i]
        for (let j = i + 1; j < n; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDistSq) {
            const t = 1 - Math.sqrt(d2) / linkDistance          // 0..1
            const bi = Math.min(BUCKETS - 1, (t * BUCKETS) | 0) // fast floor
            const buf = lineBuffers[bi]
            buf.push(a.x, a.y, b.x, b.y)
          }
        }
      }

      ctx.lineWidth = 0.9
      for (let bi = 0; bi < BUCKETS; bi++) {
        const segs = lineBuffers[bi]
        if (!segs.length) continue
        const alpha = ((bi + 0.5) / BUCKETS) * 0.22
        ctx.strokeStyle = `rgba(52,211,153,${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let k = 0; k < segs.length; k += 4) {
          ctx.moveTo(segs[k],     segs[k + 1])
          ctx.lineTo(segs[k + 2], segs[k + 3])
        }
        ctx.stroke()
      }

      // Particles — no shadowBlur (shadow rendering requires multiple GPU passes)
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

    function start() {
      if (active) return
      active = true
      raf = requestAnimationFrame(step)
    }

    function stop() {
      active = false
      cancelAnimationFrame(raf)
    }

    function onVisibility() {
      document.hidden ? stop() : start()
    }

    resize()
    seed()
    if (!document.hidden) start()

    document.addEventListener('visibilitychange', onVisibility)
    const ro = new ResizeObserver(() => { resize(); seed() })
    ro.observe(canvas)

    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [particleCount, linkDistance, color])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
