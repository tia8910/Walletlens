import { useState, useEffect, useRef, useCallback } from 'react'
import { useLanguage } from '../LanguageContext'

const CATEGORIES = [
  { id: 'All',        tKey: 'tipsCatAll' },
  { id: 'Risk',       tKey: 'tipsCatRisk' },
  { id: 'Psychology', tKey: 'tipsCatPsych' },
  { id: 'Strategy',   tKey: 'tipsCatStrategy' },
  { id: 'HODL',       tKey: 'tipsCatHodl' },
  { id: 'Quotes',     tKey: 'tipsCatQuotes' },
]

const QUOTES = [
  { id: 'q1',  cat: 'Quotes', type: 'quote', emoji: '💡', author: 'Warren Buffett',     title: 'Be fearful when others are greedy, and greedy when others are fearful.' },
  { id: 'q2',  cat: 'Quotes', type: 'quote', emoji: '📈', author: 'Peter Lynch',        title: 'The person that turns over the most rocks wins the game.' },
  { id: 'q3',  cat: 'Quotes', type: 'quote', emoji: '🧠', author: 'Charlie Munger',     title: 'Invert, always invert. Many hard problems are best solved when they are addressed backwards.' },
  { id: 'q4',  cat: 'Quotes', type: 'quote', emoji: '⏳', author: 'Warren Buffett',     title: 'The stock market is a device for transferring money from the impatient to the patient.' },
  { id: 'q5',  cat: 'Quotes', type: 'quote', emoji: '🌊', author: 'Jesse Livermore',    title: 'Markets are never wrong — opinions often are.' },
  { id: 'q6',  cat: 'Quotes', type: 'quote', emoji: '🔭', author: 'Peter Lynch',        title: 'Know what you own, and know why you own it.' },
  { id: 'q7',  cat: 'Quotes', type: 'quote', emoji: '🛡️', author: 'Benjamin Graham',    title: 'The intelligent investor is a realist who sells to optimists and buys from pessimists.' },
  { id: 'q8',  cat: 'Quotes', type: 'quote', emoji: '💎', author: 'Philip Fisher',      title: 'The stock market is filled with individuals who know the price of everything, but the value of nothing.' },
  { id: 'q9',  cat: 'Quotes', type: 'quote', emoji: '🎯', author: 'Paul Tudor Jones',   title: 'The secret to being successful from a trading perspective is to have an indefatigable and an undying and unquenchable thirst for information and knowledge.' },
  { id: 'q10', cat: 'Quotes', type: 'quote', emoji: '🧘', author: 'George Soros',       title: 'It\'s not whether you\'re right or wrong that\'s important, but how much money you make when you\'re right and how much you lose when you\'re wrong.' },
  { id: 'q11', cat: 'Quotes', type: 'quote', emoji: '🌱', author: 'John Templeton',     title: 'The four most dangerous words in investing are: "This time it\'s different."' },
  { id: 'q12', cat: 'Quotes', type: 'quote', emoji: '🔑', author: 'Ray Dalio',          title: 'The biggest mistake investors make is to believe that what happened in the recent past is likely to persist.' },
  { id: 'q13', cat: 'Quotes', type: 'quote', emoji: '🚀', author: 'Cathie Wood',        title: 'Innovation solves problems. Invest in the future, not the past.' },
  { id: 'q14', cat: 'Quotes', type: 'quote', emoji: '🌍', author: 'Mark Cuban',         title: 'It doesn\'t matter how many times you fail. It matters how many times you get up.' },
  { id: 'q15', cat: 'Quotes', type: 'quote', emoji: '⚡', author: 'Naval Ravikant',     title: 'Play long-term games with long-term people. All returns in life — wealth, relationships, knowledge — come from compound interest.' },
  { id: 'q16', cat: 'Quotes', type: 'quote', emoji: '🔄', author: 'Howard Marks',       title: 'You can\'t predict. You can prepare.' },
  { id: 'q17', cat: 'Quotes', type: 'quote', emoji: '🏆', author: 'Michael Saylor',     title: 'Bitcoin is a swarm of cyber hornets serving the goddess of wisdom, feeding on the fire of truth.' },
  { id: 'q18', cat: 'Quotes', type: 'quote', emoji: '💰', author: 'Satoshi Nakamoto',   title: 'If you don\'t believe it or don\'t get it, I don\'t have time to try to convince you, sorry.' },
  { id: 'q19', cat: 'Quotes', type: 'quote', emoji: '📚', author: 'Benjamin Graham',    title: 'In the short run, the market is a voting machine. In the long run, it is a weighing machine.' },
  { id: 'q20', cat: 'Quotes', type: 'quote', emoji: '✨', author: 'Warren Buffett',     title: 'Someone\'s sitting in the shade today because someone planted a tree a long time ago.' },
]

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

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ')
  let line = ''
  for (const w of words) {
    const test = line + w + ' '
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, y); y += lineH; line = w + ' '
    } else { line = test }
  }
  ctx.fillText(line.trim(), x, y)
  return y + lineH
}

function buildShareCanvas(tip) {
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  const isQuote = tip.type === 'quote'

  // Background
  const bg = ctx.createLinearGradient(0, 0, size, size)
  if (isQuote) {
    bg.addColorStop(0, '#0d1b2a'); bg.addColorStop(0.6, '#1a3050'); bg.addColorStop(1, '#0a1525')
  } else {
    bg.addColorStop(0, '#071a0c'); bg.addColorStop(0.6, '#1e3d26'); bg.addColorStop(1, '#0d2614')
  }
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  // Glow orb
  const glowColor = isQuote ? 'rgba(99,179,255,0.22)' : tip.type === 'do' ? 'rgba(var(--g-rgb),0.28)' : 'rgba(255,77,79,0.24)'
  const glow = ctx.createRadialGradient(size * 0.85, size * 0.15, 20, size * 0.85, size * 0.15, size * 0.55)
  glow.addColorStop(0, glowColor); glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  if (isQuote) {
    // Opening quote mark
    ctx.fillStyle = 'rgba(99,179,255,0.18)'
    ctx.font = '900 420px Georgia, serif'
    ctx.fillText('“', 50, 460)

    // Quote text
    ctx.fillStyle = '#ffffff'
    ctx.font = 'italic 700 58px Georgia, serif'
    const qy = wrapText(ctx, tip.title, 80, 220, size - 160, 78)

    // Author
    ctx.fillStyle = '#63b3ff'
    ctx.font = '600 40px system-ui, sans-serif'
    ctx.fillText('— ' + tip.author, 80, Math.max(qy + 30, 700))
  } else {
    const isdo = tip.type === 'do'
    const badgeColor = isdo ? '#00c853' : '#ff4d4f'

    // Type badge
    ctx.fillStyle = badgeColor
    ctx.beginPath()
    ctx.roundRect(80, 80, 240, 72, 14)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = '800 36px system-ui, sans-serif'
    ctx.fillText(isdo ? '✅  DO THIS' : '❌  AVOID THIS', 108, 127)

    // Emoji
    ctx.font = '120px serif'
    ctx.fillText(tip.emoji, 80, 310)

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = '800 72px system-ui, sans-serif'
    const titleEndY = wrapText(ctx, tip.title, 80, 440, size - 160, 84)

    // Body
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = '400 38px system-ui, sans-serif'
    wrapText(ctx, tip.body, 80, titleEndY + 10, size - 160, 52)
  }

  // Bottom brand bar
  ctx.fillStyle = isQuote ? 'rgba(99,179,255,0.10)' : 'rgba(var(--g-rgb),0.12)'
  ctx.fillRect(0, size - 130, size, 130)
  ctx.fillStyle = isQuote ? '#63b3ff' : '#00c853'
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

const ALL_ITEMS = [...TIPS, ...QUOTES]

export default function TradeTips() {
  const { t } = useLanguage()
  const [dismissed, setDismissed] = useState(false)
  const [cat, setCat] = useState('All')
  const [idx, setIdx] = useState(0)
  const [anim, setAnim] = useState('in') // 'in' | 'out'
  const [shareState, setShareState] = useState('idle') // 'idle' | 'done'
  const timerRef = useRef(null)

  const filtered = cat === 'All' ? ALL_ITEMS
    : cat === 'Quotes' ? QUOTES
    : TIPS.filter(item => item.cat === cat)
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

  const handleCat = (id) => {
    setCat(id)
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
    const shareText = tip.type === 'quote'
      ? `"${tip.title}" — ${tip.author} | WalletLens`
      : `${tip.type === 'do' ? '✅ DO:' : '❌ AVOID:'} ${tip.title} — ${tip.body} | WalletLens`
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: tip.title, text: shareText })
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
    setDismissed(true)
  }

  if (dismissed) return null

  const isQuote = tip.type === 'quote'
  const isdo = tip.type === 'do'
  const bannerClass = isQuote ? 'tips-quote' : isdo ? 'tips-do' : 'tips-dont'

  return (
    <div className={`trade-tips-banner ${bannerClass}`} role="region" aria-label={isQuote ? 'Investor quote' : 'Trader tip'}>
      {/* Header row */}
      <div className="tips-header">
        <div className="tips-label-row">
          {isQuote
            ? <span className="tips-badge tips-badge-quote">💬 QUOTE</span>
            : <span className={`tips-badge ${isdo ? 'tips-badge-do' : 'tips-badge-dont'}`}>{isdo ? '✅ DO' : '❌ AVOID'}</span>
          }
          <span className="tips-cat-pill">{tip.cat}</span>
          <span className="tips-counter">{(idx % filtered.length) + 1} / {filtered.length}</span>
        </div>
        <button className="tips-dismiss" onClick={handleDismiss} aria-label="Dismiss" title="Dismiss">✕</button>
      </div>

      {/* Category tabs */}
      <div className="tips-cats" role="tablist">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cat === c.id}
            className={`tips-cat-btn ${cat === c.id ? 'tips-cat-active' : ''}`}
            onClick={() => handleCat(c.id)}
          >{t(c.tKey)}</button>
        ))}
      </div>

      {/* Card */}
      {isQuote ? (
        <div className={`tips-card tips-card-quote tips-anim-${anim}`}>
          <span className="tips-quote-mark" aria-hidden="true">"</span>
          <div className="tips-text">
            <p className="tips-quote-text">{tip.title}</p>
            <span className="tips-quote-author">— {tip.author}</span>
          </div>
        </div>
      ) : (
        <div className={`tips-card tips-anim-${anim}`}>
          <span className="tips-emoji" aria-hidden="true">{tip.emoji}</span>
          <div className="tips-text">
            <strong className="tips-title">{tip.title}</strong>
            <p className="tips-body">{tip.body}</p>
          </div>
        </div>
      )}

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
