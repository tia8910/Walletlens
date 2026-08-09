import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { track } from '../analytics'
import Icon from '../components/Icon'
import { useTheme } from '../ThemeContext'
import { POSTS } from '../data/blogPosts'
import { useLanguage } from '../LanguageContext'
import {
  questions as academyQuestions,
  guessrCoins,
  hacks as academyHacks,
  achievementText,
  CATEGORY_KEYS,
} from '../data/academyContent'

// ── Persistence helpers ───────────────────────────────────────────────────
const STORE_KEY = 'wl_academy_v1'
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch {} }

function getTodayStr() { return new Date().toISOString().split('T')[0] }

// ── Question bank ─────────────────────────────────────────────────────────
// The bank itself lives in data/academyContent.js, one copy per language,
// with the correct-answer index and the category shared across all of them.
// Note the day index rather than a random pick: everyone gets the same daily
// question, and it must be the same question in every language.

// Shuffle deterministically by day so everyone gets the same daily question
function getDailyQuestion(bank) {
  const daysSinceEpoch = Math.floor(Date.now() / 86400000)
  return bank[daysSinceEpoch % bank.length]
}

// ── Game: Crypto Guessr ───────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const GUESSR_ROUNDS = 5

function CryptoGuessr({ onIqGain }) {
  const { t, lang } = useLanguage()
  const [phase, setPhase] = useState('idle') // idle | playing | over
  const [round, setRound] = useState(0)
  const [clueIdx, setClueIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [roundResult, setRoundResult] = useState(null) // null | 'correct' | 'wrong'
  const [chosen, setChosen] = useState(null)
  const [coins, setCoins] = useState([])
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem('wl_guessr_hs') || '0') } catch { return 0 }
  })

  function startGame() {
    const picked = shuffle(guessrCoins(lang)).slice(0, GUESSR_ROUNDS)
    setCoins(picked)
    setRound(0); setClueIdx(0); setScore(0); setRoundResult(null); setChosen(null)
    setPhase('playing')
    track('guessr_start')
  }

  function getOptions(coin) {
    const wrongs = shuffle(coin.wrong).slice(0, 3)
    return shuffle([coin.name, ...wrongs])
  }

  function revealClue() {
    if (clueIdx < 4) setClueIdx(c => c + 1)
  }

  function handleGuess(name) {
    if (roundResult !== null) return
    const coin = coins[round]
    const correct = name === coin.name
    const pts = correct ? [50, 40, 30, 20, 10][clueIdx] : 0
    setChosen(name)
    setRoundResult(correct ? 'correct' : 'wrong')
    if (pts > 0) setScore(s => s + pts)
  }

  function nextRound() {
    if (round + 1 >= GUESSR_ROUNDS) {
      endGame()
    } else {
      setRound(r => r + 1)
      setClueIdx(0)
      setRoundResult(null)
      setChosen(null)
    }
  }

  function endGame() {
    setPhase('over')
    const finalScore = score
    if (finalScore > highScore) {
      setHighScore(finalScore)
      try { localStorage.setItem('wl_guessr_hs', String(finalScore)) } catch {}
    }
    const iqGain = Math.floor(finalScore / 5)
    if (iqGain > 0) onIqGain(iqGain)
    track('guessr_end', { score: finalScore })
  }

  if (phase === 'idle') {
    return (
      <div className="guessr-idle">
        <div className="guessr-idle-icon">🕵️</div>
        <div className="guessr-idle-title">{t('ayTabGame')}</div>
        <div className="guessr-idle-sub muted">
          {t('ayGuessrIntro')}<br />
          {t('ayGuessrRules')}
        </div>
        <div className="guessr-pts-table">
          {[50, 40, 30, 20, 10].map((pts, i) => (
            <div key={pts} className="guessr-pts-row muted">{t('ayClueWorth')(pts, i + 1)}</div>
          ))}
        </div>
        <div className="blitz-hs-row">
          <span className="muted">{t('ayBestScore')}</span>
          <span className="blitz-hs">{t('ayPts')(highScore)}</span>
        </div>
        <button className="blitz-start-btn" onClick={startGame}>{t('ayStartGame')} 🕵️</button>
      </div>
    )
  }

  if (phase === 'over') {
    const isNewHs = score >= highScore && score > 0
    return (
      <div className="blitz-over">
        <div className="blitz-over-icon">{isNewHs ? '🏆' : '🕵️'}</div>
        <div className="blitz-over-score">{score}</div>
        <div className="blitz-over-label">{t('ayPoints')}</div>
        {isNewHs && <div className="blitz-new-hs">🎉 {t('ayNewHighScore')}</div>}
        <div className="blitz-iq-gain muted">{t('ayIqEarned')(Math.floor(score / 5))}</div>
        <div className="blitz-hs-row">
          <span className="muted">{t('ayBest')}</span>
          <span className="blitz-hs">{t('ayPts')(Math.max(score, highScore))}</span>
        </div>
        <button className="blitz-start-btn" onClick={startGame}>{t('ayPlayAgain')} 🕵️</button>
      </div>
    )
  }

  const coin = coins[round]
  if (!coin) return null
  const clues = coin.clues.slice(0, clueIdx + 1)
  const options = getOptions(coin)
  const ptsAvailable = [50, 40, 30, 20, 10][clueIdx]

  return (
    <div className="guessr-playing">
      <div className="guessr-header">
        <div className="guessr-round muted">{t('ayRound')(round + 1, GUESSR_ROUNDS)}</div>
        <div className="guessr-score-pill">{t('ayPts')(score)}</div>
      </div>

      <div className="guessr-mystery-coin">
        <div className="guessr-mystery-icon">❓</div>
        <div className="guessr-mystery-label">{t('ayMysteryCoin')}</div>
        <div className="guessr-pts-badge">{t('ayPtsIfCorrect')(ptsAvailable)}</div>
      </div>

      <div className="guessr-clues">
        {clues.map((clue, i) => (
          <div key={i} className="guessr-clue">
            <span className="guessr-clue-num">{i + 1}</span>
            <span>{clue}</span>
          </div>
        ))}
      </div>

      {roundResult === null && clueIdx < 4 && (
        <button className="guessr-reveal-btn" onClick={revealClue}>
          {t('ayRevealClue')}
        </button>
      )}

      {roundResult === null && (
        <div className="guessr-options">
          {options.map(name => (
            <button key={name} className="guessr-option" onClick={() => handleGuess(name)}>
              {name}
            </button>
          ))}
        </div>
      )}

      {roundResult !== null && (
        <div className={`guessr-result ${roundResult === 'correct' ? 'guessr-result-correct' : 'guessr-result-wrong'}`}>
          <div className="guessr-result-row">
            <span>{roundResult === 'correct' ? '✅' : '❌'}</span>
            <span>
              {roundResult === 'correct'
                ? t('ayGuessrCorrect')(ptsAvailable)
                : t('ayGuessrWrong')(`${coin.emoji} ${coin.name} (${coin.symbol})`)}
            </span>
          </div>
          <div className="guessr-result-options">
            {options.map(name => (
              <div key={name} className={`guessr-result-opt ${name === coin.name ? 'guessr-result-correct-opt' : name === chosen ? 'guessr-result-wrong-opt' : ''}`}>
                {name}
              </div>
            ))}
          </div>
          <button className="blitz-start-btn" style={{ marginTop: '1rem' }} onClick={nextRound}>
            {round + 1 >= GUESSR_ROUNDS ? t('aySeeResults') : t('ayNextRound') + ' →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Game: Knowledge Wheel (Spin & Learn) ──────────────────────────────────
// A spin-the-wheel quiz. Six topic wedges serve a question from that category;
// two bonus wedges reward the player (2× IQ question, or +2 free spins). Correct
// answers grant IQ + a free spin; sharing grants spins once a day. All spins are
// tracked in the shared academy store so the dashboard card can show them.
// `cat` is the question-bank category id and stays English; labelKey is what
// the player reads.
const WHEEL_WEDGES = [
  { id: 'crypto',   labelKey: 'assetCrypto',      icon: 'coins',    cat: 'Crypto',   color: '#f7931a' },
  { id: 'markets',  labelKey: 'ayCatMarkets',     icon: 'trend-up', cat: 'Markets',  color: '#3b82f6' },
  { id: 'risk',     labelKey: 'ayCatRisk',        icon: 'shield',   cat: 'Risk',     color: '#ef4444' },
  { id: 'defi',     labelKey: 'ayCatDefi',        icon: 'bank',     cat: 'DeFi',     color: '#22c55e' },
  { id: 'security', labelKey: 'ayCatSecurity',    icon: 'lock',     cat: 'Security', color: '#8b5cf6' },
  { id: 'strategy', labelKey: 'ayCatStrategy',    icon: 'target',   cat: 'Strategy', color: '#0ea5e9' },
  { id: 'double',   labelKey: 'ayWedgeDouble',    icon: 'diamond',  cat: null, multiplier: 2, color: '#fbbf24' },
  { id: 'bonus',    labelKey: 'ayWedgeBonus',     icon: 'gift',     cat: null, reward: 'spins', color: '#ec4899' },
]
const WHEEL_SLICE = 360 / WHEEL_WEDGES.length
const WHEEL_DAILY_SPINS = 3

function wheelStateOf(store) {
  const today = getTodayStr()
  const w = store?.wheel
  if (!w || w.date !== today) return { date: today, left: WHEEL_DAILY_SPINS, sharedToday: false }
  return w
}

function pickQuestion(cat, bank) {
  const pool = cat ? bank.filter(q => q.cat === cat) : bank
  const list = pool.length ? pool : bank
  return list[Math.floor(Math.random() * list.length)]
}

function KnowledgeWheel({ store, onIqGain, setWheel }) {
  const { t, lang } = useLanguage()
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [phase, setPhase]       = useState('idle') // idle | question | answered | reward
  const [wedge, setWedge]       = useState(null)
  const [q, setQ]               = useState(null)
  const [selected, setSelected] = useState(null)
  const [rewardMsg, setRewardMsg] = useState('')
  const [lastIq, setLastIq]     = useState(0)
  const rotRef = useRef(0)
  const wRef   = useRef(wheelStateOf(store))
  wRef.current = wheelStateOf(store)
  const spins = wRef.current.left
  const sharedToday = wRef.current.sharedToday

  function commitWheel(patch) {
    const next = { ...wRef.current, ...patch }
    wRef.current = next
    setWheel(next)
  }

  function spin() {
    if (spinning || spins <= 0) return
    setSpinning(true)
    setPhase('idle'); setWedge(null); setQ(null); setSelected(null); setRewardMsg('')
    commitWheel({ left: spins - 1 })
    const k = Math.floor(Math.random() * WHEEL_WEDGES.length)
    const targetPos = k * WHEEL_SLICE + WHEEL_SLICE / 2
    const currentMod = ((rotRef.current % 360) + 360) % 360
    let delta = ((360 - targetPos) - currentMod)
    delta = ((delta % 360) + 360) % 360
    const next = rotRef.current + 360 * 5 + delta
    rotRef.current = next
    setRotation(next)
    track('wheel_spin', { wedge: WHEEL_WEDGES[k].id })
    setTimeout(() => {
      setSpinning(false)
      const landed = WHEEL_WEDGES[k]
      setWedge(landed)
      if (landed.reward === 'spins') {
        commitWheel({ left: wRef.current.left + 2 })
        setRewardMsg('🎁 ' + t('ayBonusSpins'))
        setPhase('reward')
      } else {
        setQ(pickQuestion(landed.cat, academyQuestions(lang)))
        setPhase('question')
      }
    }, 4200)
  }

  function answer(idx) {
    if (phase !== 'question' || selected !== null) return
    setSelected(idx)
    const correct = idx === q.a
    const mult = wedge?.multiplier || 1
    const gain = correct ? 25 * mult : 0
    setLastIq(gain)
    if (correct) {
      onIqGain(gain)
      commitWheel({ left: wRef.current.left + 1 }) // earn a spin for a correct answer
    }
    setPhase('answered')
    track('wheel_answer', { correct, cat: wedge?.cat || wedge?.id, gain })
  }

  async function shareForSpins() {
    track('wheel_share', { alreadyClaimed: sharedToday })
    const text = t('ayWheelShareText')
    const url = 'https://walletlens.live/academy?tab=wheel'
    try {
      if (navigator.share) {
        await navigator.share({ title: t('ayWheelShareTitle'), text, url })
      } else {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener')
      }
    } catch { /* user cancelled share sheet — still grant once daily below */ }
    if (!wRef.current.sharedToday) {
      commitWheel({ left: wRef.current.left + 2, sharedToday: true })
      setRewardMsg('🎉 ' + t('ayThanksSharing'))
    }
  }

  return (
    <div className="kw-wrap">
      <div className="kw-topbar">
        <div className="kw-spins">
          <span className="kw-spins-num">{spins}</span>
          <span className="kw-spins-lbl muted">{t('aySpinsLeft')}</span>
        </div>
        <button className="kw-share-btn" onClick={shareForSpins} disabled={sharedToday}
          title={sharedToday ? t('ayShareClaimedTitle') : t('ayShareTitle')}>
          {sharedToday ? '✓ ' + t('aySharedClaimed') : '📤 ' + t('ayShareForSpins')}
        </button>
      </div>

      <div className="kw-wheel-stage">
        <div className="kw-pointer" />
        <div className="kw-wheel" style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 4.1s cubic-bezier(0.16,1,0.3,1)' : 'none',
          background: `conic-gradient(${WHEEL_WEDGES.map((w, i) => `${w.color} ${i * WHEEL_SLICE}deg ${(i + 1) * WHEEL_SLICE}deg`).join(', ')})`,
        }}>
          {WHEEL_WEDGES.map((w, i) => {
            const angle = i * WHEEL_SLICE + WHEEL_SLICE / 2
            return (
              <div key={w.id} className="kw-wedge-label" style={{ transform: `rotate(${angle}deg) translateY(-96px) rotate(${-angle}deg)` }}>
                <Icon name={w.icon} size={24} />
              </div>
            )
          })}
        </div>
        <div className="kw-hub">🎡</div>
      </div>

      <button className="kw-spin-btn blitz-start-btn" onClick={spin} disabled={spinning || spins <= 0}>
        {spinning ? t('aySpinning') : spins > 0 ? t('aySpin') : t('ayNoSpins')}
      </button>
      {spins <= 0 && !spinning && (
        <p className="kw-hint muted">{t('aySpinsHint')}</p>
      )}

      {/* Reward wedge result */}
      {phase === 'reward' && wedge && (
        <div className="kw-result glass-card">
          <div className="kw-result-emoji" style={{ color: wedge.color }}><Icon name={wedge.icon} size={40} /></div>
          <div className="kw-result-title">{rewardMsg}</div>
          <button className="blitz-start-btn" onClick={spin} disabled={spins <= 0}>{t('aySpinAgain')}</button>
        </div>
      )}

      {/* Question flow */}
      {(phase === 'question' || phase === 'answered') && q && (
        <div className="kw-question glass-card">
          <div className="kw-q-cat" style={{ background: (wedge?.color || 'var(--g)') + '22', color: wedge?.color || 'var(--g-ink)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            {wedge && <Icon name={wedge.icon} size={14} />} {wedge ? t(wedge.labelKey) : ''}{wedge?.multiplier ? ' — ' + t('ayDoublePoints') : ''}
          </div>
          <div className="kw-q-text">{q.q}</div>
          <div className="kw-q-opts">
            {q.opts.map((opt, i) => {
              let cls = 'kw-q-opt'
              if (phase === 'answered') {
                if (i === q.a) cls += ' kw-q-correct'
                else if (i === selected) cls += ' kw-q-wrong'
              }
              return (
                <button key={i} className={cls} onClick={() => answer(i)} disabled={phase === 'answered'}>
                  {opt}
                </button>
              )
            })}
          </div>
          {phase === 'answered' && (
            <div className="kw-explain">
              <div className={`kw-verdict ${selected === q.a ? 'ok' : 'no'}`}>
                {selected === q.a ? '✅ ' + t('ayCorrectIqSpin')(lastIq) : '❌ ' + t('ayNotQuite')}
              </div>
              <p className="kw-exp-text">{q.exp}</p>
              <button className="blitz-start-btn" onClick={spin} disabled={spins <= 0}>
                {spins > 0 ? t('aySpinAgain') : t('ayOutOfSpins')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CAT_COLORS = {
  Entry: 'var(--g)', Risk: '#f87171', Strategy: '#a78bfa',
  Portfolio: '#60a5fa', Profit: '#fbbf24', Psychology: '#f472b6',
  Research: '#38bdf8',
}
const CAT_COLORS_LIGHT = {
  Entry:      '#15803d',
  Risk:       '#dc2626',
  Strategy:   '#6d28d9',
  Portfolio:  '#1d4ed8',
  Profit:     '#b45309',
  Psychology: '#be185d',
  Research:   '#0369a1',
}

// ── Achievements ──────────────────────────────────────────────────────────
// Ids and point values only. Titles and descriptions are per-language and
// live in data/academyContent.js; the id is what a user's earned-badge list
// is keyed on, so it must never change.
const ACHIEVEMENTS = [
  { id: 'first_lesson',    icon: '📖', pts: 50  },
  { id: 'streak_3',        icon: '🔥', pts: 100 },
  { id: 'streak_7',        icon: '⚡', pts: 200 },
  { id: 'streak_30',       icon: '💎', pts: 500 },
  { id: 'perfect_score',   icon: '🎯', pts: 75  },
  { id: 'fast_answer',     icon: '⚡', pts: 100 },
  { id: 'all_categories',  icon: '🌈', pts: 150 },
  { id: 'security_expert', icon: '🛡️', pts: 120 },
  { id: 'defi_master',     icon: '🏦', pts: 100 },
  { id: 'risk_aware',      icon: '⚠️', pts: 120 },
  { id: 'crypto_scholar',  icon: '🎓', pts: 200 },
  { id: 'psychologist',    icon: '🧠', pts: 100 },
  { id: 'iq_500',          icon: '🥉', pts: 0   },
  { id: 'iq_1000',         icon: '🥈', pts: 0   },
  { id: 'iq_2000',         icon: '🥇', pts: 0   },
  { id: 'iq_5000',         icon: '👑', pts: 0   },
]

// A key rather than a word: this runs at module scope, with no hook to call.
function getRank(iq) {
  if (iq >= 5000) return { labelKey: 'ayRankLegend', color: '#ffd700', icon: '👑' }
  if (iq >= 2000) return { labelKey: 'ayRankWhale',  color: '#a78bfa', icon: '🥇' }
  if (iq >= 1000) return { labelKey: 'ayRankStrategist', color: '#60a5fa', icon: '🥈' }
  if (iq >= 500)  return { labelKey: 'ayRankAnalyst', color: 'var(--g-ink)', fontWeight: 700, icon: '🥉' }
  if (iq >= 200)  return { labelKey: 'ayRankTrader',  color: '#f59e0b', icon: '📈' }
  return { labelKey: 'ayRankRookie', color: 'rgba(255,255,255,0.75)', icon: '🌱' }
}

// ── Share hack as image ────────────────────────────────────────────────────
function drawHackImage(hack, color) {
  const W = 1200, H = 630
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const gRgb = getComputedStyle(document.documentElement).getPropertyValue('--g-rgb').trim() || '0,200,83'

  // Background
  ctx.fillStyle = '#071a0c'
  ctx.fillRect(0, 0, W, H)

  // Subtle grid lines
  ctx.strokeStyle = `rgba(${gRgb},0.06)`
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }

  // Left accent bar
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 6, H)

  // WalletLens logo — magnifying glass with chart bars (matches Logo.jsx @ 64×64 viewBox)
  // Scale factor: render at ~80px → scale = 80/64 = 1.25, offset to (32, 32)
  const logoScale = 1.25, ox = 32, oy = 32
  const lt = (x, y) => [ox + x * logoScale, oy + y * logoScale]
  // Gradient: #4ade80 → #16a34a
  const lg = ctx.createLinearGradient(...lt(5, 5), ...lt(52, 52))
  lg.addColorStop(0, '#4ade80'); lg.addColorStop(0.5, '#16a34a'); lg.addColorStop(1, '#14532d')
  // Main ring
  const [rcx, rcy] = lt(27, 25)
  ctx.strokeStyle = lg; ctx.lineWidth = 5.5 * logoScale; ctx.globalAlpha = 1
  ctx.beginPath(); ctx.arc(rcx, rcy, 19 * logoScale, 0, Math.PI * 2); ctx.stroke()
  // Small dot upper-right
  const [dcx, dcy] = lt(40.5, 11.5)
  ctx.fillStyle = '#4ade80'
  ctx.beginPath(); ctx.arc(dcx, dcy, 3.8 * logoScale, 0, Math.PI * 2); ctx.fill()
  // Ascending bars
  ctx.fillStyle = lg
  const bars = [[14.5, 26.5, 5, 7.5], [21.5, 21, 5, 13], [28.5, 15.5, 5, 18.5]]
  for (const [bx, by, bw, bh] of bars) {
    const [px, py] = lt(bx, by)
    ctx.beginPath(); ctx.roundRect(px, py, bw * logoScale, bh * logoScale, 1.2 * logoScale); ctx.fill()
  }
  // Handle
  ctx.strokeStyle = lg; ctx.lineWidth = 5.5 * logoScale; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(...lt(13.5, 39)); ctx.lineTo(...lt(4, 55)); ctx.stroke()

  // Brand name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText('WalletLens', 122, 65)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('walletlens.live', 124, 90)

  // Category pill
  ctx.fillStyle = color + '33'
  const pillW = 140, pillH = 36
  ctx.beginPath(); ctx.roundRect(68, 150, pillW, pillH, 18); ctx.fill()
  ctx.fillStyle = color
  ctx.font = 'bold 17px system-ui, sans-serif'
  ctx.fillText(`${hack.icon}  ${hack.cat}`, 88, 174)

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 52px system-ui, sans-serif'
  const words = hack.title.split(' ')
  let line = '', y = 260, lineH = 64
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width > W - 136) { ctx.fillText(line, 68, y); line = w; y += lineH }
    else line = test
  }
  ctx.fillText(line, 68, y)

  // Body text (wrapped, smaller)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '24px system-ui, sans-serif'
  const bodyWords = hack.body.split(' ')
  let bl = '', by = y + 70, bLineH = 38, bLines = 0
  for (const w of bodyWords) {
    const test = bl ? bl + ' ' + w : w
    if (ctx.measureText(test).width > W - 136) {
      if (bLines < 3) { ctx.fillText(bl, 68, by); by += bLineH; bLines++ }
      bl = w
    } else bl = test
  }
  if (bLines < 3 && bl) ctx.fillText(bl, 68, by)

  // Bottom bar
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, H - 60, W, 60)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('💡 Investment Hack  •  walletlens.live/academy', 68, H - 22)

  return c.toDataURL('image/png')
}

async function shareHackToX(hack, color) {
  const dataUrl = drawHackImage(hack, color)
  const text = `${hack.icon} ${hack.title}\n\n${hack.body.slice(0, 160)}…\n\n#WalletLens #Crypto #InvestmentTips`
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://walletlens.live')}`

  // Try Web Share API first (mobile)
  if (navigator.canShare) {
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], 'walletlens-hack.png', { type: 'image/png' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: hack.title, text })
        return
      }
    } catch { /* fall through */ }
  }

  // Desktop fallback: download image + open X
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'walletlens-hack.png'
  a.click()
  setTimeout(() => window.open(xUrl, '_blank'), 400)
}

// ── Article helpers ───────────────────────────────────────────────────────
// Ids, not labels: getArticleCat returns these and the filter compares them.
const ARTICLE_CATS = ['All', 'Crypto', 'Strategy', 'Net Worth', 'Tracking', 'Tax & P&L']
const ARTICLE_CAT_KEYS = {
  All: 'txAll', Crypto: 'assetCrypto', Strategy: 'ayCatStrategy',
  'Net Worth': 'ayCatNetWorth', Tracking: 'ayCatTracking', 'Tax & P&L': 'ayCatTax',
}

function getArticleCat(slug) {
  if (/net-worth|grow-your-net|calculate-your-net|tracker-vs-spread|best-free-net-worth/.test(slug)) return 'Net Worth'
  if (/tax|profit-calculator|cost-basis/.test(slug)) return 'Tax & P&L'
  if (/diversif|profit-target|dca|dollar-cost|position-sizing|rebalance|portfolio-allocation/.test(slug)) return 'Strategy'
  if (/track|portfolio-tracker|alternatives|apple-stock|gold-silver|bitcoin-portfolio/.test(slug)) return 'Tracking'
  return 'Crypto'
}

const ARTICLE_CAT_COLORS = {
  Crypto:     { dark: '#60a5fa', light: '#1d4ed8' },
  Strategy:   { dark: '#a78bfa', light: '#6d28d9' },
  'Net Worth': { dark: 'var(--g)', light: '#15803d' },
  Tracking:   { dark: '#fbbf24', light: '#b45309' },
  'Tax & P&L': { dark: '#f87171', light: '#dc2626' },
}

// ── HackCard ──────────────────────────────────────────────────────────────
function HackCard({ hack, color }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function handleShare(e) {
    e.stopPropagation()
    setSharing(true)
    track('hack_share', { title: hack.title })
    await shareHackToX(hack, color)
    setSharing(false)
  }

  return (
    <div className={`acad-hack-card ${open ? 'acad-hack-open' : ''}`}
      onClick={() => { if (!open) track('hack_expand', { title: hack.title, cat: hack.cat }); setOpen(o => !o) }}
      style={{ '--hack-color': color }}>
      <div className="acad-hack-header">
        <span className="acad-hack-icon">{hack.icon}</span>
        <div className="acad-hack-meta">
          <span className="acad-hack-cat" style={{ color }}>{t(hack.catKey)}</span>
          <div className="acad-hack-title">{hack.title}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <button className="hack-share-btn" onClick={handleShare} disabled={sharing}
            title={t('share')}>
            {sharing ? '⏳' : '𝕏'}
          </button>
          <span className="acad-hack-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="acad-hack-body">{hack.body}</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
export default function Academy() {
  const { t, lang } = useLanguage()
  const { mode: themeMode } = useTheme()
  const isLight = themeMode === 'light'
  const [store, setStore] = useState(loadStore)
  const [phase, setPhase]         = useState('idle')  // idle | playing | result | explanation
  const [selected, setSelected]   = useState(null)
  const [timeLeft, setTimeLeft]   = useState(10)
  const [newBadges, setNewBadges] = useState([])
  const [activeTab, setActiveTab] = useState(() => {
    // Deep-link support: /academy?tab=wheel opens a specific tab (used by the
    // dashboard "Spin & Learn" card).
    try {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (['challenge', 'badges', 'wheel', 'game', 'hacks', 'articles'].includes(t)) return t
    } catch { /* no window/search */ }
    return 'challenge'
  }) // challenge | badges | wheel | game | hacks | articles
  const [articleFilter, setArticleFilter] = useState('All')
  const timerRef = useRef(null)
  const startTime = useRef(null)

  const todayStr   = getTodayStr()
  const alreadyDone = store.lastPlayed === todayStr
  const badgeText  = achievementText(lang)
  const question   = getDailyQuestion(academyQuestions(lang))

  // Init store defaults
  useEffect(() => {
    track('academy_view')
    setStore(prev => ({
      iq: 0, streak: 0, lastPlayed: null, totalCorrect: 0,
      categoryCounts: {}, earnedBadges: [],
      ...prev,
    }))
  }, [])

  // Countdown timer
  useEffect(() => {
    if (phase !== 'playing') { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleTimeout(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  function startChallenge() {
    setPhase('playing')
    setSelected(null)
    setTimeLeft(10)
    startTime.current = Date.now()
    track('academy_challenge_start', { question_cat: question.cat })
  }

  function handleTimeout() {
    setSelected(-1) // timed out
    setPhase('result')
    updateStore(false, 99)
  }

  function handleAnswer(idx) {
    if (phase !== 'playing' || selected !== null) return
    clearInterval(timerRef.current)
    const elapsed = (Date.now() - startTime.current) / 1000
    const correct = idx === question.a
    setSelected(idx)
    setPhase('result')
    updateStore(correct, elapsed)
    track('academy_answer', { correct, cat: question.cat, elapsed_s: elapsed.toFixed(1) })
  }

  function updateStore(correct, elapsed) {
    setStore(prev => {
      const today = getTodayStr()
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const newStreak = correct
        ? (prev.lastPlayed === yesterday ? (prev.streak || 0) + 1 : 1)
        : 0

      const catCounts = { ...(prev.categoryCounts || {}) }
      if (correct) catCounts[question.cat] = (catCounts[question.cat] || 0) + 1

      const iqGain = correct
        ? 20 + (elapsed < 3 ? 30 : elapsed < 5 ? 10 : 0) + (newStreak >= 7 ? 20 : newStreak >= 3 ? 10 : 0)
        : 0
      const newIq = (prev.iq || 0) + iqGain
      const newCorrect = (prev.totalCorrect || 0) + (correct ? 1 : 0)

      // Check badge unlocks
      const earned = new Set(prev.earnedBadges || [])
      const freshBadges = []
      function maybeEarn(id) { if (!earned.has(id)) { earned.add(id); freshBadges.push(id) } }

      if (correct && newCorrect === 1)   maybeEarn('first_lesson')
      if (correct && newStreak >= 3)     maybeEarn('streak_3')
      if (correct && newStreak >= 7)     maybeEarn('streak_7')
      if (correct && newStreak >= 30)    maybeEarn('streak_30')
      if (correct)                        maybeEarn('perfect_score')
      if (correct && elapsed < 3)        maybeEarn('fast_answer')
      if (Object.keys(catCounts).length >= 5) maybeEarn('all_categories')
      if ((catCounts['Security'] || 0) >= 5)  maybeEarn('security_expert')
      if ((catCounts['DeFi'] || 0) >= 3)      maybeEarn('defi_master')
      if ((catCounts['Risk'] || 0) >= 5)      maybeEarn('risk_aware')
      if ((catCounts['Crypto'] || 0) >= 10)   maybeEarn('crypto_scholar')
      if ((catCounts['Psychology'] || 0) >= 3) maybeEarn('psychologist')
      if (newIq >= 500)  maybeEarn('iq_500')
      if (newIq >= 1000) maybeEarn('iq_1000')
      if (newIq >= 2000) maybeEarn('iq_2000')
      if (newIq >= 5000) maybeEarn('iq_5000')

      const badgePts = freshBadges.reduce((s, id) => {
        const b = ACHIEVEMENTS.find(a => a.id === id)
        return s + (b?.pts || 0)
      }, 0)

      if (freshBadges.length) setNewBadges(freshBadges)

      const updated = {
        ...prev,
        iq: newIq + badgePts,
        streak: newStreak,
        lastPlayed: today,
        totalCorrect: newCorrect,
        categoryCounts: catCounts,
        earnedBadges: [...earned],
      }
      saveStore(updated)
      return updated
    })
  }

  const rank = getRank(store.iq || 0)
  const earnedSet = new Set(store.earnedBadges || [])

  return (
    <div className="acad-root">
      {/* New badge toast */}
      {newBadges.length > 0 && (
        <div className="acad-toast-wrap">
          {newBadges.map(id => {
            const b = ACHIEVEMENTS.find(a => a.id === id)
            return b ? (
              <div key={id} className="acad-toast" onAnimationEnd={() => setNewBadges(p => p.filter(x => x !== id))}>
                <span className="acad-toast-icon">{b.icon}</span>
                <div>
                  <div className="acad-toast-title">{t('ayBadgeUnlocked')}</div>
                  <div className="acad-toast-badge">{badgeText[b.id]?.title}</div>
                </div>
              </div>
            ) : null
          })}
        </div>
      )}

      {/* Header */}
      <div className="acad-header">
        <div className="acad-header-left">
          <div className="acad-logo">🎓</div>
          <div>
            <div className="acad-title">{t('ayTitle')}</div>
            <div className="acad-subtitle muted">{t('aySubtitle')}</div>
          </div>
        </div>
        <div className="acad-iq-pill" style={{ borderColor: rank.color + '44', background: rank.color + '12' }}>
          <span style={{ color: rank.color }}>{rank.icon} {store.iq || 0}</span>
          <span className="muted" style={{ fontSize: '0.7rem' }}>{t('ayIq')}</span>
        </div>
      </div>

      {/* Rank card */}
      <div className="glass-card acad-rank-card">
        <div className="acad-rank-left">
          <div className="acad-rank-icon" style={{ color: rank.color }}>{rank.icon}</div>
          <div>
            <div className="acad-rank-label" style={{ color: rank.color }}>{t(rank.labelKey)}</div>
            <div className="muted" style={{ fontSize: '0.74rem' }}>{t('ayIqValue')((store.iq || 0).toLocaleString())}</div>
          </div>
        </div>
        <div className="acad-rank-stats">
          <div className="acad-stat">
            <div className="acad-stat-val">{store.totalCorrect || 0}</div>
            <div className="acad-stat-lbl muted">{t('ayCorrect')}</div>
          </div>
          <div className="acad-stat">
            <div className="acad-stat-val">{store.streak || 0}🔥</div>
            <div className="acad-stat-lbl muted">{t('ayStreak')}</div>
          </div>
          <div className="acad-stat">
            <div className="acad-stat-val">{(store.earnedBadges || []).length}</div>
            <div className="acad-stat-lbl muted">{t('ayBadges')}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="acad-tabs">
        {[
          { id: 'challenge', label: '📅 ' + t('ayTabChallenge') },
          { id: 'badges',    label: '🏆 ' + t('ayBadgesTab')((store.earnedBadges||[]).length, ACHIEVEMENTS.length) },
          { id: 'wheel',     label: '🎡 ' + t('ayTabWheel') },
          { id: 'game',      label: '🕵️ ' + t('ayTabGame') },
          { id: 'hacks',     label: '💡 ' + t('ayTabHacks') },
          { id: 'articles',  label: '📚 ' + t('ayArticlesTab')(POSTS.length) },
        ].map(tab => (
          <button key={tab.id} className={`acad-tab ${activeTab === tab.id ? 'acad-tab-active' : ''}`}
            onClick={() => { setActiveTab(tab.id); track('academy_tab_switch', { tab: tab.id }) }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CHALLENGE TAB ── */}
      {activeTab === 'challenge' && (
        <div className="glass-card acad-challenge-card">
          {/* Category + timer */}
          <div className="acad-challenge-meta">
            <span className="acad-cat-badge">{t(CATEGORY_KEYS[question.cat] || question.cat)}</span>
            {phase === 'playing' && (
              <div className="acad-timer" style={{ color: timeLeft <= 3 ? '#f87171' : 'var(--g-ink)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {t('ayTimerSeconds')(timeLeft)}
              </div>
            )}
          </div>

          {/* Question */}
          <div className="acad-question">{question.q}</div>

          {/* Options */}
          <div className="acad-options">
            {question.opts.map((opt, i) => {
              let cls = 'acad-option'
              if (phase === 'result' || phase === 'explanation') {
                if (i === question.a) cls += ' acad-option-correct'
                else if (i === selected) cls += ' acad-option-wrong'
              }
              return (
                <button key={i} className={cls}
                  onClick={() => handleAnswer(i)}
                  disabled={phase !== 'playing'}>
                  <span className="acad-option-letter">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>

          {/* Idle state */}
          {phase === 'idle' && !alreadyDone && (
            <button className="acad-start-btn" onClick={startChallenge}>
              {t('ayStartChallenge')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          )}

          {/* Already done */}
          {alreadyDone && phase === 'idle' && (
            <div className="acad-done-msg">
              <span className="acad-done-icon">✅</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--g-ink)' }}>{t('ayDoneTitle')}</div>
                <div className="muted" style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>{t('ayComeBack')(store.streak)}🔥</div>
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'result' && (
            <div className={`acad-result ${selected === question.a ? 'acad-result-correct' : 'acad-result-wrong'}`}>
              {selected === -1 ? (
                <><span>⏱️</span> {t('ayTimesUp')()} <strong>{question.opts[question.a]}</strong></>
              ) : selected === question.a ? (
                <><span>✅</span> {t('ayCorrectIq')(selected === question.a && (Date.now() - startTime.current) / 1000 < 3 ? '50' : '20')}</>
              ) : (
                <><span>❌</span> {t('ayWrongAnswer')()} <strong>{question.opts[question.a]}</strong></>
              )}
              <button className="acad-explain-btn" onClick={() => setPhase('explanation')}>{t('ayWhy')} →</button>
            </div>
          )}

          {/* Explanation */}
          {phase === 'explanation' && (
            <div className="acad-explanation">
              <div className="acad-explain-title">💡 {t('ayExplanation')}</div>
              <div className="acad-explain-text">{question.exp}</div>
            </div>
          )}
        </div>
      )}

      {/* ── BADGES TAB ── */}
      {activeTab === 'badges' && (
        <div className="acad-badges-grid">
          {ACHIEVEMENTS.map(b => {
            const earned = earnedSet.has(b.id)
            return (
              <div key={b.id} className={`acad-badge-card ${earned ? 'acad-badge-earned' : 'acad-badge-locked'}`}>
                <div className="acad-badge-icon" style={{ opacity: earned ? 1 : 0.3 }}>{b.icon}</div>
                <div className="acad-badge-title" style={{ color: earned ? 'var(--text)' : 'var(--text-sub)' }}>{badgeText[b.id]?.title}</div>
                <div className="acad-badge-desc muted">{badgeText[b.id]?.desc}</div>
                {b.pts > 0 && <div className="acad-badge-pts" style={{ color: earned ? '#fbbf24' : 'var(--text-sub)' }}>{t('ayBadgePts')(b.pts)}</div>}
                {earned && <div className="acad-badge-earned-label">{t('ayEarned')}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── GAME TAB ── */}
      {activeTab === 'wheel' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <KnowledgeWheel
            store={store}
            onIqGain={pts => {
              setStore(prev => {
                const updated = { ...prev, iq: (prev.iq || 0) + pts }
                saveStore(updated)
                return updated
              })
            }}
            setWheel={w => {
              setStore(prev => {
                const updated = { ...prev, wheel: w }
                saveStore(updated)
                return updated
              })
            }}
          />
        </div>
      )}

      {activeTab === 'game' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <CryptoGuessr onIqGain={pts => {
            setStore(prev => {
              const updated = { ...prev, iq: (prev.iq || 0) + pts }
              saveStore(updated)
              return updated
            })
          }} />
        </div>
      )}

      {/* ── HACKS TAB ── */}
      {activeTab === 'hacks' && (
        <div className="acad-hacks-list">
          {academyHacks(lang).map((h, i) => {
            const palette = isLight ? CAT_COLORS_LIGHT : CAT_COLORS
            const color = palette[h.cat] || (isLight ? '#15803d' : '#a78bfa')
            return (
              <HackCard key={i} hack={h} color={color} />
            )
          })}
        </div>
      )}

      {/* ── ARTICLES TAB ── */}
      {activeTab === 'articles' && (
        <div className="acad-articles-wrap">
          <div className="acad-articles-filters">
            {ARTICLE_CATS.map(cat => (
              <button
                key={cat}
                className={`acad-articles-filter-btn ${articleFilter === cat ? 'acad-articles-filter-active' : ''}`}
                onClick={() => { setArticleFilter(cat); track('academy_article_filter', { cat }) }}
              >
                {t(ARTICLE_CAT_KEYS[cat] || cat)}
              </button>
            ))}
          </div>
          <div className="acad-articles-list">
            {POSTS
              .filter(p => articleFilter === 'All' || getArticleCat(p.slug) === articleFilter)
              .map(post => {
                const cat = getArticleCat(post.slug)
                const catColor = isLight
                  ? (ARTICLE_CAT_COLORS[cat]?.light || '#15803d')
                  : (ARTICLE_CAT_COLORS[cat]?.dark || 'var(--g)')
                return (
                  <Link
                    key={post.slug}
                    to={`/blog/${post.slug}/`}
                    className="acad-article-card"
                    onClick={() => track('academy_article_click', { slug: post.slug, cat })}
                  >
                    <div className="acad-article-top">
                      <span className="acad-article-cat" style={{ color: catColor, borderColor: catColor + '44', background: catColor + '12' }}>{t(ARTICLE_CAT_KEYS[cat] || cat)}</span>
                      <span className="acad-article-time muted">{post.readTime}</span>
                    </div>
                    <div className="acad-article-title">{post.title}</div>
                    <div className="acad-article-summary muted">{post.summary.length > 120 ? post.summary.slice(0, 120) + '…' : post.summary}</div>
                    <div className="acad-article-cta">{t('ayReadArticle')} →</div>
                  </Link>
                )
              })}
          </div>
        </div>
      )}

      {/* IQ guide */}
      <div className="glass-card acad-iq-guide">
        <div className="acad-iq-guide-title">{t('ayIqRanks')}</div>
        <div className="acad-iq-guide-grid">
          {[
            { icon: '🌱', label: t('ayRankRookie'),     range: '0–199' },
            { icon: '📈', label: t('ayRankTrader'),     range: '200–499' },
            { icon: '🥉', label: t('ayRankAnalyst'),    range: '500–999' },
            { icon: '🥈', label: t('ayRankStrategist'), range: '1,000–1,999' },
            { icon: '🥇', label: t('ayRankWhale'),      range: '2,000–4,999' },
            { icon: '👑', label: t('ayRankLegend'),     range: '5,000+' },
          ].map(r => (
            <div key={r.label} className="acad-iq-guide-row">
              <span>{r.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{r.label}</span>
              <span className="muted" style={{ fontSize: '0.74rem' }}>{r.range}</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.75rem', lineHeight: 1.5 }}>
          {t('ayIqExplain')}
        </p>
      </div>
    </div>
  )
}
