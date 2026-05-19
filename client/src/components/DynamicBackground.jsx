import { useEffect, useRef } from 'react'

export default function DynamicBackground({
  particleCount = 55,
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

    // Cache CSS color vars — read getComputedStyle every ~2s instead of every frame
    let cachedCol = '#34d399'
    let cachedRgb = '52,211,153'
    let colorTick = 0

    function updateColors() {
      if (color) { cachedCol = color; return }
      const style = getComputedStyle(document.documentElement)
      cachedCol = style.getPropertyValue('--g').trim() || '#34d399'
      cachedRgb = style.getPropertyValue('--g-rgb').trim() || '52,211,153'
    }

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

    // Pre-allocated opacity bins to avoid GC pressure per frame.
    // Lines are grouped by alpha level so we do O(BINS) canvas state changes
    // instead of O(pairs) — drops canvas ops from thousands to 8.
    const BINS = 8
    const lineBins = Array.from({ length: BINS }, () => [])
    const linkDist2 = linkDistance * linkDistance

    function step() {
      // Pause rendering when tab is hidden — resume instantly on focus
      if (document.hidden) { raf = requestAnimationFrame(step); return }

      // Refresh CSS color vars every ~2 s instead of every frame
      if (++colorTick % 120 === 0) updateColors()

      ctx.clearRect(0, 0, w, h)

      // Clear bins from the previous frame
      for (let b = 0; b < BINS; b++) lineBins[b].length = 0

      // Classify each line segment into an opacity bucket
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < linkDist2) {
            const alpha = 1 - Math.sqrt(d2) / linkDistance
            const bin = Math.min(BINS - 1, (alpha * BINS) | 0)
            lineBins[bin].push(a.x, a.y, b.x, b.y)
          }
        }
      }

      // Draw each bucket in a single path — 8 ctx.stroke calls total
      ctx.lineWidth = 0.9
      for (let bin = 0; bin < BINS; bin++) {
        const coords = lineBins[bin]
        if (!coords.length) continue
        const alpha = ((bin + 0.5) / BINS) * 0.22
        ctx.strokeStyle = `rgba(${cachedRgb},${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let k = 0; k < coords.length; k += 4) {
          ctx.moveTo(coords[k], coords[k + 1])
          ctx.lineTo(coords[k + 2], coords[k + 3])
        }
        ctx.stroke()
      }

      // Move and draw particles (no shadowBlur — GPU compositing cost removed)
      ctx.fillStyle = cachedCol
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = w + 10
        else if (p.x > w + 10) p.x = -10
        if (p.y < -10) p.y = h + 10
        else if (p.y > h + 10) p.y = -10
        ctx.fillRect(p.x, p.y, p.size, p.size)
      }

      raf = requestAnimationFrame(step)
    }

    updateColors()
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
