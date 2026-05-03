import { useState, useEffect, useRef, useCallback } from 'react'

const CATEGORIES = ['All', 'Risk', 'Psychology', 'Strategy', 'HODL']

const TIPS = [
  // Risk
  { id: 1, cat: 'Risk', type: 'do',   emoji: '🛡️', title: 'Use stop-losses', body: 'Set a stop-loss before you enter any trade. Know your exit before your entry.' },
  { id: 2, cat: 'Risk', type: 'dont', emoji: '🎰', title: "Don't bet the house", body: 'Never risk more than 1–2% of your portfolio on a single trade. Survival is the edge.' },
  { id: 3, cat: 'Risk', type: 'do',   emoji: '⚖️', title: 'Size positions wisely', body: 'Your position size should reflect conviction AND volatility — not just excitement.' },
  { id: 4, cat: 'Risk', type: 'dont', emoji: '📉', title: "Don't average down blindly", body: 'Adding to a losing trade without a plan just makes a small problem bigger.' },
  { id: 5, cat: 'Risk', type: 'do',   emoji: '🔒', title: 'Protect your gains', body: 'Trail your stop-loss as a trade moves in your favour. Lock in profits incrementally.' },
  // Psychology
  { id: 6,  cat: 'Psychology', type: 'dont', emoji: '😱', title: 'Never trade on FOMO',        body: "If you're chasing a candle that already moved 30%, you're too late. Wait for the next setup." },
  { id: 7,  cat: 'Psychology', type: 'do',   emoji: '📓', title: 'Keep a trading journal',     body: 'Write down your reasoning before every trade. Patterns in your losses will become obvious.' },
  { id: 8,  cat: 'Psychology', type: 'dont', emoji: '🤬', title: 'Avoid revenge trading',      body: 'After a loss, step away. Trying to "win it back" immediately compounds the damage.' },
  { id: 9,  cat: 'Psychology', type: 'do',   emoji: '🧘', title: 'Stick to your plan',         body: 'A mediocre strategy executed consistently beats a brilliant strategy executed emotionally.' },
  { id: 10, cat: 'Psychology', type: 'dont', emoji: '📺', title: "Don't trade on Twitter hype", body: "By the time it's trending, insiders have already exited. Hype is exit liquidity." },
  // Strategy
  { id: 11, cat: 'Strategy', type: 'do',   emoji: '🗺️', title: 'Define entry & exit upfront', body: 'Know your take-profit AND your stop-loss before you click buy. No improvising mid-trade.' },
  { id: 12, cat: 'Strategy', type: 'dont', emoji: '🔮', title: "Don't try to call tops/bottoms", body: 'Markets can stay irrational longer than you can stay solvent. Trade price action, not predictions.' },
  { id: 13, cat: 'Strategy', type: 'do',   emoji: '📊', title: 'Backtest your ideas',          body: 'Before you risk real money, stress-test your strategy on historical data. Reality is humbling.' },
  { id: 14, cat: 'Strategy', type: 'dont', emoji: '🔄', title: "Don't over-trade",             body: 'More trades = more fees + more emotional decisions. Quality setups beat quantity every time.' },
  { id: 15, cat: 'Strategy', type: 'do',   emoji: '💧', title: 'Trade liquid markets',         body: 'Illiquid assets have wide spreads and can trap you in a position. Liquidity is your escape hatch.' },
  // HODL
  { id: 16, cat: 'HODL', type: 'do',   emoji: '⏳', title: 'Think in years, not days',    body: 'The best returns in crypto & stocks have gone to patient holders, not daily traders.' },
  { id: 17, cat: 'HODL', type: 'dont', emoji: '👀', title: "Don't check prices hourly",   body: 'Frequent price-checking triggers emotional decisions. Set alerts and close the tab.' },
  { id: 18, cat: 'HODL', type: 'do',   emoji: '🌱', title: 'DCA on dips',                 body: 'Dollar-cost averaging into conviction assets during downturns builds positions at lower average cost.' },
  { id: 19, cat: 'HODL', type: 'dont', emoji: '💬', title: "Don't sell on bad headlines", body: "Markets have survived every \"it's over\" headline. Zoom out before reacting to news." },
  { id: 20, cat: 'HODL', type: 'do',   emoji: '🎯', title: 'Set price targets in advance', body: "Decide your exit price when you're calm and greedy — not when you're scared and losing." },
]

function buildShareCanvas(tip) {
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  // Background
  const bg = ctx.createLinearGradient(0, 0, size, size)
  bg.addColorStop(0, '#071a0c')
  bg.addColorStop(0.6, '#1e3d26')
  bg.addColorStop(1, '#0d2614')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  // Glow orb
  const glow = ctx.createRadialGradient(size * 0.85, size * 0.15, 20, size * 0.85, size * 0.15, size * 0.55)
  glow.addColorStop(0, tip.type === 'do' ? 'rgba(0,200,83,0.28)' : 'rgba(255,77,79,0.24)')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  // Type badge background
  const isdo = tip.type === 'do'
  const badgeColor = isdo ? '#00c853' : '#ff4d4f'
  ctx.fillStyle = badgeColor
  ctx.beginPath()
  ctx.roundRect(80, 80, 220, 72, 14)
  ctx.fill()

  // Type badge text
  ctx.fillStyle = '#fff'
  ctx.font = '800 36px system-ui, sans-serif'
  ctx.fillText(isdo ? '✅  DO THIS' : '❌  AVOID THIS', 110, 127)

  // Emoji
  ctx.font = '120px serif'
  ctx.fillText(tip.emoji, 80, 310)

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 72px system-ui, sans-serif'
  const words = tip.title.split(' ')
  let line = ''; let y = 440
  for (const w of words) {
    const test = line + w + ' '
    if (ctx.measureText(test).width > size - 160 && line) {
      ctx.fillText(line.trim(), 80, y); y += 84; line = w + ' '
    } else { line = test }
  }
  ctx.fillText(line.trim(), 80, y); y += 60

  // Body
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = '400 38px system-ui, sans-serif'
  const bwords = tip.body.split(' ')
  let bl = ''; let by = y + 30
  for (const w of bwords) {
    const test = bl + w + ' '
    if (ctx.measureText(test).width > size - 160 && bl) {
      ctx.fillText(bl.trim(), 80, by); by += 52; bl = w + ' '
    } else { bl = test }
  }
  ctx.fillText(bl.trim(), 80, by)

  // Bottom brand bar
  ctx.fillStyle = 'rgba(0,200,83,0.12)'
  ctx.fillRect(0, size - 130, size, 130)
  ctx.fillStyle = '#00c853'
  ctx.font = '700 38px system-ui, sans-serif'
  ctx.fillText('WalletLens', 80, size - 68)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '400 26px system-ui, sans-serif'
  ctx.fillText('walletlens.cc  ·  zoom in your wealth', 80, size - 28)

  return canvas
}

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

export default function TradeTips() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('tips-dismissed') === '1')
  const [cat, setCat] = useState('All')
  const [idx, setIdx] = useState(0)
  const [anim, setAnim] = useState('in') // 'in' | 'out'
  const [shareState, setShareState] = useState('idle') // 'idle' | 'done'
  const timerRef = useRef(null)

  const filtered = cat === 'All' ? TIPS : TIPS.filter(t => t.cat === cat)
  const tip = filtered[idx % filtered.length]

  const goTo = useCallback((nextIdx, dir = 'next') => {
    setAnim('out-' + dir)
    setTimeout(() => {
      setIdx(nextIdx)
      setAnim('in-' + dir)
    }, 220)
  }, [])

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setIdx(i => {
        const next = (i + 1) % filtered.length
        setAnim('out-next')
        setTimeout(() => setAnim('in-next'), 220)
        return next
      })
    }, 7000)
  }, [filtered.length])

  useEffect(() => {
    if (dismissed) return
    startTimer()
    return () => clearInterval(timerRef.current)
  }, [dismissed, startTimer])

  const handleCat = (c) => {
    setCat(c)
    setIdx(0)
    setAnim('in-next')
    startTimer()
  }

  const handlePrev = () => {
    clearInterval(timerRef.current)
    goTo((idx - 1 + filtered.length) % filtered.length, 'prev')
    startTimer()
  }

  const handleNext = () => {
    clearInterval(timerRef.current)
    goTo((idx + 1) % filtered.length, 'next')
    startTimer()
  }

  const handleShare = async () => {
    const canvas = buildShareCanvas(tip)
    const blob = await canvasToBlob(canvas)
    const file = new File([blob], 'walletlens-tip.png', { type: 'image/png' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: tip.title, text: `${tip.type === 'do' ? '✅ DO:' : '❌ AVOID:'} ${tip.title} — ${tip.body} | WalletLens` })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'walletlens-tip.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    setShareState('done')
    setTimeout(() => setShareState('idle'), 2000)
  }

  const handleDismiss = () => {
    sessionStorage.setItem('tips-dismissed', '1')
    setDismissed(true)
  }

  if (dismissed) return null

  const isdo = tip.type === 'do'

  return (
    <div className={`trade-tips-banner ${isdo ? 'tips-do' : 'tips-dont'}`} role="region" aria-label="Trader tip">
      {/* Header row */}
      <div className="tips-header">
        <div className="tips-label-row">
          <span className={`tips-badge ${isdo ? 'tips-badge-do' : 'tips-badge-dont'}`}>
            {isdo ? '✅ DO' : '❌ AVOID'}
          </span>
          <span className="tips-cat-pill">{tip.cat}</span>
          <span className="tips-counter">{(idx % filtered.length) + 1} / {filtered.length}</span>
        </div>
        <button className="tips-dismiss" onClick={handleDismiss} aria-label="Dismiss tips banner" title="Dismiss">✕</button>
      </div>

      {/* Category tabs */}
      <div className="tips-cats" role="tablist">
        {CATEGORIES.map(c => (
          <button
            key={c}
            role="tab"
            aria-selected={cat === c}
            className={`tips-cat-btn ${cat === c ? 'tips-cat-active' : ''}`}
            onClick={() => handleCat(c)}
          >{c}</button>
        ))}
      </div>

      {/* Tip card */}
      <div className={`tips-card tips-anim-${anim}`}>
        <span className="tips-emoji" aria-hidden="true">{tip.emoji}</span>
        <div className="tips-text">
          <strong className="tips-title">{tip.title}</strong>
          <p className="tips-body">{tip.body}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="tips-controls">
        <button className="tips-nav-btn" onClick={handlePrev} aria-label="Previous tip">‹</button>

        {/* Progress dots */}
        <div className="tips-dots" aria-hidden="true">
          {filtered.map((_, i) => (
            <span
              key={i}
              className={`tips-dot ${i === idx % filtered.length ? 'tips-dot-active' : ''}`}
              onClick={() => { clearInterval(timerRef.current); goTo(i); startTimer() }}
            />
          ))}
        </div>

        <button className="tips-nav-btn" onClick={handleNext} aria-label="Next tip">›</button>

        <button className="tips-share-btn" onClick={handleShare} aria-label="Share this tip">
          {shareState === 'done'
            ? <><span>✓</span> Saved!</>
            : <><ShareIcon /> Share</>}
        </button>
      </div>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )
}
