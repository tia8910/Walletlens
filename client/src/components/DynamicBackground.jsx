import { useEffect, useRef, useMemo } from 'react'

// Detect low-power devices (mobile or < 4 logical CPUs) so we can throttle
// the particle simulation before it affects frame rate.
function getParticleCount(requested, reducedMotion, mobile, lowPower) {
  if (reducedMotion) return 0
  if (mobile || lowPower) return Math.min(requested, 40)
  return requested
}

// MediaQueryList objects are stable — create them once per module load
// so matchMedia is never called inside render or on every animation frame.
const _mqlReduceMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const _mqlMobile = typeof window !== 'undefined'
  ? window.matchMedia('(max-width: 768px)') : null
const _lowPower = typeof navigator !== 'undefined'
  && navigator.hardwareConcurrency != null && navigator.hardwareConcurrency < 4

export default function DynamicBackground({
  particleCount = 100,
  linkDistance = 140,
  color = null,
}) {
  const canvasRef = useRef(null)

  // Read from stable MQL objects — no layout recalc, no new objects per render.
  const reduceMotion = _mqlReduceMotion?.matches ?? false
  const mobile       = _mqlMobile?.matches ?? false
  const effectiveCount = useMemo(
    () => getParticleCount(particleCount, reduceMotion, mobile, _lowPower),
    [particleCount, reduceMotion, mobile]
  )
  // shadowBlur is expensive (GPU composite step per-particle). Skip it on
  // mobile and low-power CPUs where it measurably drops frame rate.
  const useShadow = !mobile && !_lowPower

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
    // Listen for palette changes dispatched by ThemeContext.applyTheme().
    // MutationObserver on class/data-theme never fired because ThemeContext
    // toggles data-wl-light and writes inline styles — not those attributes.
    document.addEventListener('wl-theme', readColors)

    function resize() {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const particles = Array.from({ length: effectiveCount }, () => ({
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

    // Reuse one Map per effect lifetime — avoids creating a new object each frame.
    // Bucket arrays inside are recreated on clear(), but Map itself stays stable.
    const gridCells = new Map()

    function step() {
      ctx.clearRect(0, 0, w, h)

      // Build spatial grid in O(n). Cell size equals linkDistance so that any
      // two particles within connection range differ by at most ±1 cell in each
      // axis — checking the 3×3 neighbourhood is both necessary and sufficient.
      gridCells.clear()
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const key = (Math.floor(p.x / linkDistance) | 0) * 10000 + (Math.floor(p.y / linkDistance) | 0)
        const b = gridCells.get(key)
        if (b) b.push(i); else gridCells.set(key, [i])
      }

      // Draw connecting lines — O(n × avg_neighbours) instead of O(n²).
      // With 100 particles on a typical 1920×1080 canvas and linkDistance=140,
      // this cuts per-frame distance checks from ~5 000 to ~400 (12× speedup).
      ctx.strokeStyle = `rgba(${rgb}, 0.14)`
      ctx.lineWidth = 0.9
      ctx.beginPath()
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        const cx = Math.floor(a.x / linkDistance) | 0
        const cy = Math.floor(a.y / linkDistance) | 0
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nbrs = gridCells.get((cx + dx) * 10000 + (cy + dy))
            if (!nbrs) continue
            for (let k = 0; k < nbrs.length; k++) {
              const j = nbrs[k]
              if (j <= i) continue
              const b = particles[j]
              const ex = a.x - b.x, ey = a.y - b.y
              if (ex * ex + ey * ey < D2) {
                ctx.moveTo(a.x, a.y)
                ctx.lineTo(b.x, b.y)
              }
            }
          }
        }
      }
      ctx.stroke()

      // Particles — no shadowBlur (expensive GPU compositing pass per particle)
      ctx.fillStyle = col
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

    let resizeTimer = null
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => { resize(); seed() }, 150)
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      ro.disconnect()
      document.removeEventListener('wl-theme', readColors)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [effectiveCount, linkDistance, color, reduceMotion, useShadow])

  return <canvas ref={canvasRef} className="dynamic-bg" aria-hidden="true" />
}
