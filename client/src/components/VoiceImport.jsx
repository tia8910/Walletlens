import { useState, useRef, useEffect } from 'react'
import { loadData, saveData, bumpId } from '../data/storage'

// ── Bilingual crypto vocabulary (EN + AR, with slang) ──────────────────────
const COIN_MAP = (() => {
  const c = {}
  const add = (aliases, id, symbol, name) => {
    aliases.forEach(a => { c[a.toLowerCase()] = { id, symbol, name } })
  }
  add(['bitcoin','btc','bee tee cee','bitty','bitcorn','digital gold','the king','satoshi','sats',
       'بيتكوين','بتكوين','بيت كوين','بي تي سي'], 'bitcoin', 'BTC', 'Bitcoin')
  add(['ethereum','eth','ether','vitalik','smart contract coin',
       'إيثيريوم','إيثر','ايثيريوم','ايثر','اي تي اتش'], 'ethereum', 'ETH', 'Ethereum')
  add(['solana','sol','salami','سولانا','سول'], 'solana', 'SOL', 'Solana')
  add(['bnb','binance coin','binance','بي إن بي','بينانس'], 'binancecoin', 'BNB', 'BNB')
  add(['xrp','ripple','إكس آر بي','ريبل'], 'ripple', 'XRP', 'XRP')
  add(['cardano','ada','كاردانو','ايه دي ايه'], 'cardano', 'ADA', 'Cardano')
  add(['dogecoin','doge','the dog','elon coin','دوج','دوجكوين'], 'dogecoin', 'DOGE', 'Dogecoin')
  add(['shiba','shib','shiba inu','شيبا','شيب'], 'shiba-inu', 'SHIB', 'Shiba Inu')
  add(['pepe','pepe coin','the frog','بيبي','بيبيه'], 'pepe', 'PEPE', 'Pepe')
  add(['polkadot','dot','بولكادوت','دوت'], 'polkadot', 'DOT', 'Polkadot')
  add(['chainlink','link','تشين لينك','لينك'], 'chainlink', 'LINK', 'Chainlink')
  add(['avalanche','avax','أفالانش','أفاكس','افاكس'], 'avalanche-2', 'AVAX', 'Avalanche')
  add(['polygon','matic','pol','بوليجون','بوليغون','ماتيك'], 'matic-network', 'POL', 'Polygon')
  add(['tron','trx','ترون','تي آر إكس'], 'tron', 'TRX', 'TRON')
  add(['litecoin','ltc','لايتكوين','لايت كوين'], 'litecoin', 'LTC', 'Litecoin')
  add(['bitcoin cash','bch','بيتكوين كاش'], 'bitcoin-cash', 'BCH', 'Bitcoin Cash')
  add(['tether','usdt','تيذر','يو إس دي تي'], 'tether', 'USDT', 'Tether')
  add(['usdc','يو إس دي سي'], 'usd-coin', 'USDC', 'USD Coin')
  add(['uniswap','uni','يونيسواب'], 'uniswap', 'UNI', 'Uniswap')
  add(['aave','آفي'], 'aave', 'AAVE', 'Aave')
  add(['arbitrum','arb','أربيتروم'], 'arbitrum', 'ARB', 'Arbitrum')
  add(['optimism','op','أوبتيميزم'], 'optimism', 'OP', 'Optimism')
  add(['near','نير'], 'near', 'NEAR', 'NEAR')
  add(['stellar','xlm','ستيلر'], 'stellar', 'XLM', 'Stellar')
  add(['cosmos','atom','كوزموس','أتوم'], 'cosmos', 'ATOM', 'Cosmos')
  add(['hyperliquid','hype','هايبر','هايب'], 'hyperliquid', 'HYPE', 'Hyperliquid')
  add(['sui','سوي'], 'sui', 'SUI', 'Sui')
  add(['aptos','apt','أبتوس'], 'aptos', 'APT', 'Aptos')
  add(['wif','dogwifhat','dog wif hat','ويف'], 'dogwifcoin', 'WIF', 'dogwifhat')
  add(['bonk','بونك'], 'bonk', 'BONK', 'Bonk')
  add(['floki','فلوكي'], 'floki', 'FLOKI', 'Floki')
  add(['injective','inj','إنجيكتيف'], 'injective-protocol', 'INJ', 'Injective')
  return c
})()

// ── Intent vocabulary — verbs and slang for buy/sell ───────────────────────
const BUY_WORDS = [
  'buy','bought','buying','get','got','getting','grab','grabbed','snag','snagged',
  'scoop','scooped','scoop up','load up','loaded','loaded up','stack','stacked','stacking',
  'ape','aped','aped into','yolo','yoloed','long','longed','went long','picked up',
  'cop','copped','dca','dollar cost average','accumulate','accumulated','accumulating',
  'purchase','purchased','add','added',
  'اشتريت','شريت','اشتري','شري','أخذت','اخذت','جبت','دخلت','جمعت','كومت','كسبت','استثمرت'
]

const SELL_WORDS = [
  'sell','sold','selling','dump','dumped','dumping','exit','exited','exiting',
  'cash out','cashed out','take profits','took profits','tp','tp\'d','offload','offloaded',
  'unload','unloaded','short','shorted','went short','rug','rugged','close','closed',
  'بعت','بيعت','بيع','صفيت','خرجت','خروج','اخرج'
]

// ── Number parsing — handles "5k", "2 million", "ألف", "مليون", "ثلاثة" ────
const AR_NUMBERS = {
  'صفر':0,'واحد':1,'اثنين':2,'اثنان':2,'ثلاثة':3,'ثلاث':3,'أربعة':4,'اربعة':4,'خمسة':5,'خمس':5,
  'ستة':6,'ست':6,'سبعة':7,'سبع':7,'ثمانية':8,'تسعة':9,'عشرة':10,'عشر':10,
  'مية':100,'مائة':100,'ألف':1000,'الف':1000,'مليون':1000000,
}

function parseNumber(str) {
  if (!str) return null
  const trimmed = str.trim()
  // Plain number with optional unit suffix
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|ألف|الف|مليون|مليار)?/i)
  if (m) {
    let n = parseFloat(m[1].replace(',', '.'))
    const unit = (m[2] || '').toLowerCase()
    if (['k','thousand','ألف','الف'].includes(unit)) n *= 1000
    else if (['m','million','مليون'].includes(unit)) n *= 1000000
    else if (['b','billion','مليار'].includes(unit)) n *= 1000000000
    return n
  }
  // Arabic word numbers (single token)
  if (AR_NUMBERS[trimmed]) return AR_NUMBERS[trimmed]
  return null
}

// ── The brain: parse a transcript into a structured trade ──────────────────
function parseVoiceCommand(text) {
  const original = text
  const normalized = ' ' + text.toLowerCase().trim().replace(/[.,!?]/g, ' ') + ' '

  // 1. Intent (buy / sell)
  let type = null
  let matchedWord = null
  for (const kw of BUY_WORDS) {
    if (normalized.includes(' ' + kw.toLowerCase() + ' ')) { type = 'buy'; matchedWord = kw; break }
  }
  if (!type) {
    for (const kw of SELL_WORDS) {
      if (normalized.includes(' ' + kw.toLowerCase() + ' ')) { type = 'sell'; matchedWord = kw; break }
    }
  }

  // 2. Coin — try longest aliases first (so "bitcoin cash" beats "bitcoin")
  let coin = null
  const aliases = Object.keys(COIN_MAP).sort((a, b) => b.length - a.length)
  for (const alias of aliases) {
    if (normalized.includes(' ' + alias + ' ')) { coin = COIN_MAP[alias]; break }
  }

  // 3. Numbers — find all, then figure out which is amount vs price
  // Look for explicit "at $X" / "for $X" / "بسعر X" / "ب X" patterns for price
  let price = null
  const priceRegex = /(?:at|for|@|بسعر|ب)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|ألف|الف|مليون|مليار)?/i
  const priceMatch = normalized.match(priceRegex)
  if (priceMatch) {
    price = parseNumber(priceMatch[1] + (priceMatch[2] || ''))
  }

  // Find all numbers
  const allNumbers = []
  const numRegex = /(\d+(?:[.,]\d+)?)\s*(k|m|b|thousand|million|billion|ألف|الف|مليون|مليار)?/gi
  let nm
  while ((nm = numRegex.exec(normalized)) !== null) {
    const parsed = parseNumber(nm[1] + (nm[2] || ''))
    if (parsed != null) allNumbers.push(parsed)
  }

  // Amount = first number that isn't the price
  let amount = null
  if (allNumbers.length > 0) {
    amount = allNumbers.find(n => n !== price)
    if (amount == null && allNumbers.length === 1 && price == null) amount = allNumbers[0]
    if (amount == null && price == null) amount = allNumbers[0]
  }

  // If we only got one number and no explicit price, treat it as amount
  if (amount != null && price == null && allNumbers.length >= 2) {
    // Heuristic: larger one is price (USD), smaller is amount of coin
    const others = allNumbers.filter(n => n !== amount)
    if (others.length > 0) {
      const possible = others[0]
      if (possible > amount * 10) price = possible
      else if (amount > possible * 10) { price = amount; amount = possible }
    }
  }

  return { type, coin, amount, price, original, matchedWord }
}

// ── Fun reactions for slang detected — adds personality ────────────────────
function getReaction(text, parsed) {
  const t = text.toLowerCase()
  if (t.includes('yolo') || t.includes('aped')) return { emoji:'🦍', msg:'Apes together strong!' }
  if (t.includes('diamond') || t.includes('hodl')) return { emoji:'💎', msg:'Diamond hands!' }
  if (t.includes('moon') || t.includes('to the moon')) return { emoji:'🚀', msg:'To the moon!' }
  if (t.includes('rugged') || t.includes('dumped')) return { emoji:'📉', msg:'Got it. Better luck next time.' }
  if (t.includes('took profits') || t.includes('tp\'d')) return { emoji:'💰', msg:'Nice profits!' }
  if (t.includes('بعت') && parsed.type === 'sell') return { emoji:'💸', msg:'تم البيع!' }
  if (t.includes('اشتريت') && parsed.type === 'buy') return { emoji:'🎯', msg:'صفقة شراء!' }
  if (parsed.type === 'buy') return { emoji:'📈', msg:'New position locked in.' }
  if (parsed.type === 'sell') return { emoji:'✅', msg:'Position closed.' }
  return null
}

function fmtAmt(n) {
  if (n == null) return '—'
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

// ── Example commands shown to user ─────────────────────────────────────────
const EXAMPLES_EN = [
  '"I bought 0.5 Bitcoin at 60k"',
  '"Sold 3 SOL for 220 each"',
  '"Aped 1000 PEPE at 0.00001"',
  '"Took profits on 2 ETH at 3500"',
]
const EXAMPLES_AR = [
  '"اشتريت بيتكوين 0.5 بسعر 60 ألف"',
  '"بعت 3 سولانا بـ 220"',
  '"دخلت 1000 دوج"',
  '"اشتريت إيثيريوم بـ 3500"',
]

// ── Web Speech API support check ───────────────────────────────────────────
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const SUPPORTED = !!SR

// ── Component ───────────────────────────────────────────────────────────────
export default function VoiceImport() {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState('en') // 'en' | 'ar'
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState(null)
  const [reaction, setReaction] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef(null)

  const startListening = () => {
    if (!SUPPORTED) { setError('Voice recognition not supported in this browser. Try Chrome or Edge.'); return }
    setError(''); setTranscript(''); setParsed(null); setReaction(null); setConfirmed(false)

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = lang === 'ar' ? 'ar-SA' : 'en-US'

    rec.onstart = () => setListening(true)
    rec.onend = () => setListening(false)
    rec.onerror = e => {
      setListening(false)
      if (e.error === 'not-allowed') setError('Microphone permission denied. Please allow mic access.')
      else if (e.error === 'no-speech') setError("I didn't catch that — please try again.")
      else setError(`Voice error: ${e.error}`)
    }

    rec.onresult = e => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript
      }
      setTranscript(text)
      const p = parseVoiceCommand(text)
      if (p.type || p.coin || p.amount) {
        setParsed(p)
        setReaction(getReaction(text, p))
      }
    }

    recRef.current = rec
    try { rec.start() } catch { /* already listening */ }
  }

  const stopListening = () => {
    try { recRef.current?.stop() } catch {}
    setListening(false)
  }

  useEffect(() => () => { try { recRef.current?.stop() } catch {} }, [])

  const handleImport = () => {
    if (!parsed?.coin || !parsed?.type || !parsed?.amount) return
    const wallets = loadData('wallets')
    const walletId = wallets[0]?.id || 1
    const txs = loadData('transactions')
    const today = new Date().toISOString().split('T')[0]
    const pricePerUnit = parsed.price || 0
    const totalCost = parsed.amount * pricePerUnit
    txs.unshift({
      id: bumpId('crypto_tracker_next_tx_id'),
      wallet_id: parseInt(walletId),
      type: parsed.type, category: 'crypto',
      coin_id: parsed.coin.id,
      coin_symbol: parsed.coin.symbol,
      coin_name: parsed.coin.name,
      coin_image: '',
      amount: parsed.amount,
      price_per_unit: pricePerUnit,
      total_cost: totalCost,
      exchange: 'Voice Import',
      notes: `"${transcript}"`,
      date: today,
      created_at: new Date().toISOString(),
    })
    saveData('transactions', txs)
    setConfirmed(true)
  }

  const isAr = lang === 'ar'
  const canImport = parsed?.coin && parsed?.type && parsed?.amount

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.18))' : 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(236,72,153,0.1))',
          border: '1px solid rgba(168,85,247,0.35)',
          borderRadius: '12px', color: '#c084fc',
          padding: '0.55rem 0.9rem', fontWeight: 700, fontSize: '0.85rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '0.5rem', width: '100%', justifyContent: 'space-between',
        }}
      >
        <span style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
          Import by Voice <span style={{ fontSize:'0.7rem', opacity:0.7 }}>· EN / عربي</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(236,72,153,0.06))',
          border: '1px solid rgba(168,85,247,0.2)',
          borderRadius: '16px', padding: '1.25rem', marginTop: '0.6rem',
          backdropFilter: 'blur(12px)',
          direction: isAr ? 'rtl' : 'ltr',
        }}>
          {/* Language toggle */}
          <div style={{ display:'flex', gap:'0.4rem', justifyContent:'center', marginBottom:'1rem' }}>
            <button onClick={() => setLang('en')} style={{
              padding:'0.3rem 0.85rem', borderRadius:'18px', fontSize:'0.78rem', fontWeight:700,
              cursor:'pointer', border:'1.5px solid',
              borderColor: lang === 'en' ? '#c084fc' : 'rgba(255,255,255,0.12)',
              background: lang === 'en' ? 'rgba(192,132,252,0.2)' : 'transparent',
              color: lang === 'en' ? '#e9d5ff' : 'var(--text-muted)',
            }}>🇺🇸 English</button>
            <button onClick={() => setLang('ar')} style={{
              padding:'0.3rem 0.85rem', borderRadius:'18px', fontSize:'0.78rem', fontWeight:700,
              cursor:'pointer', border:'1.5px solid',
              borderColor: lang === 'ar' ? '#c084fc' : 'rgba(255,255,255,0.12)',
              background: lang === 'ar' ? 'rgba(192,132,252,0.2)' : 'transparent',
              color: lang === 'ar' ? '#e9d5ff' : 'var(--text-muted)',
            }}>🇸🇦 عربي</button>
          </div>

          {/* Mic button — center */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.7rem', marginBottom:'1rem' }}>
            <div style={{ position:'relative', width:96, height:96 }}>
              {listening && (
                <>
                  <div style={{
                    position:'absolute', inset:0, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(192,132,252,0.5), transparent 70%)',
                    animation:'vi-pulse 1.5s ease-out infinite',
                  }} />
                  <div style={{
                    position:'absolute', inset:0, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(236,72,153,0.4), transparent 70%)',
                    animation:'vi-pulse 1.5s ease-out infinite 0.5s',
                  }} />
                </>
              )}
              <button
                onClick={listening ? stopListening : startListening}
                disabled={!SUPPORTED}
                style={{
                  position:'relative', width:96, height:96, borderRadius:'50%',
                  border:'none', cursor: SUPPORTED ? 'pointer' : 'not-allowed',
                  background: listening
                    ? 'linear-gradient(135deg, #f87171, #ec4899)'
                    : 'linear-gradient(135deg, #a855f7, #ec4899)',
                  boxShadow: listening
                    ? '0 0 40px rgba(236,72,153,0.6), inset 0 -3px 0 rgba(0,0,0,0.2)'
                    : '0 8px 24px rgba(168,85,247,0.4), inset 0 -3px 0 rgba(0,0,0,0.2)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'transform 0.15s, box-shadow 0.2s',
                  transform: listening ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
              </button>
            </div>
            <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', margin:0, textAlign:'center' }}>
              {listening
                ? (isAr ? '🎙️ أتحدث الآن…' : '🎙️ Listening… speak now')
                : (isAr ? 'اضغط الميكروفون وقل صفقتك' : 'Tap the mic and say your trade')}
            </p>
          </div>

          {/* Live transcript */}
          {transcript && (
            <div style={{
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
              borderRadius:'12px', padding:'0.75rem 1rem', marginBottom:'0.75rem',
            }}>
              <p style={{ fontSize:'0.7rem', color:'#c084fc', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 0.3rem' }}>
                {isAr ? 'سمعت' : 'I heard'}
              </p>
              <p style={{ margin:0, fontSize:'0.92rem', color:'var(--text)', fontStyle:'italic', lineHeight:1.4 }}>
                "{transcript}"
              </p>
            </div>
          )}

          {/* Parsed result card */}
          {parsed && (
            <div style={{
              background: canImport
                ? 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(34,197,94,0.08))'
                : 'rgba(245,158,11,0.08)',
              border: `1.5px solid ${canImport ? 'rgba(74,222,128,0.35)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius:'12px', padding:'0.85rem 1rem', marginBottom:'0.75rem',
            }}>
              {reaction && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.5rem' }}>
                  <span style={{ fontSize:'1.4rem' }}>{reaction.emoji}</span>
                  <span style={{ fontSize:'0.82rem', color:'var(--text)', fontWeight:600 }}>{reaction.msg}</span>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'0.35rem 0.85rem', fontSize:'0.82rem' }}>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'النوع' : 'Action'}</span>
                <span style={{ color: parsed.type === 'buy' ? '#4ade80' : parsed.type === 'sell' ? '#f87171' : 'var(--text-muted)', fontWeight:700 }}>
                  {parsed.type ? (parsed.type === 'buy' ? (isAr ? '🟢 شراء' : '🟢 Buy') : (isAr ? '🔴 بيع' : '🔴 Sell')) : (isAr ? '⚠️ غير محدد' : '⚠️ Not detected')}
                </span>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'العملة' : 'Coin'}</span>
                <span style={{ color:'var(--text)', fontWeight:700 }}>
                  {parsed.coin ? `${parsed.coin.symbol} · ${parsed.coin.name}` : (isAr ? '⚠️ غير محدد' : '⚠️ Not detected')}
                </span>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'الكمية' : 'Amount'}</span>
                <span style={{ color:'var(--text)', fontWeight:700, fontFamily:'monospace' }}>
                  {parsed.amount != null ? fmtAmt(parsed.amount) : (isAr ? '⚠️ غير محدد' : '⚠️ Not detected')}
                </span>
                <span style={{ color:'var(--text-muted)' }}>{isAr ? 'السعر' : 'Price'}</span>
                <span style={{ color:'var(--text)', fontFamily:'monospace' }}>
                  {parsed.price != null ? '$' + fmtAmt(parsed.price) : (isAr ? 'لم يُذكر' : 'Not specified')}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
              borderRadius:'8px', color:'#f87171',
              padding:'0.5rem 0.75rem', fontSize:'0.82rem', marginBottom:'0.75rem',
            }}>
              {error}
            </div>
          )}

          {/* Confirm / imported */}
          {parsed && canImport && (
            confirmed ? (
              <div style={{
                background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.35)',
                borderRadius:'10px', color:'#4ade80',
                padding:'0.6rem 0.75rem', fontSize:'0.85rem', textAlign:'center', fontWeight:700,
              }}>
                ✅ {isAr ? 'تم إضافة الصفقة بنجاح!' : 'Trade added successfully!'}
              </div>
            ) : (
              <button onClick={handleImport} style={{
                width:'100%',
                background:'linear-gradient(135deg, #4ade80, #22c55e)',
                border:'none', borderRadius:'10px', color:'#fff',
                padding:'0.7rem', fontWeight:800, fontSize:'0.9rem', cursor:'pointer',
                boxShadow:'0 4px 14px rgba(34,197,94,0.4)',
              }}>
                ✨ {isAr ? 'إضافة الصفقة' : 'Add this trade'}
              </button>
            )
          )}

          {/* Examples */}
          {!transcript && !error && (
            <div style={{ marginTop:'0.5rem' }}>
              <p style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 0.5rem', textAlign:'center' }}>
                {isAr ? '💡 جرّب أن تقول' : '💡 Try saying'}
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                {(isAr ? EXAMPLES_AR : EXAMPLES_EN).map((ex, i) => (
                  <div key={i} style={{
                    fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic',
                    padding:'0.4rem 0.7rem', background:'rgba(255,255,255,0.03)',
                    borderRadius:'8px', border:'1px solid rgba(255,255,255,0.06)',
                  }}>
                    {ex}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!SUPPORTED && (
            <p style={{ fontSize:'0.75rem', color:'#f59e0b', margin:'0.75rem 0 0', textAlign:'center' }}>
              ⚠️ {isAr ? 'المتصفح لا يدعم التعرف على الصوت' : 'Your browser does not support voice recognition. Try Chrome, Edge, or Safari.'}
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes vi-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.7); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
