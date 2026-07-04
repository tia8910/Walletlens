import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import { chatWithAssistant, parseAssistantReply } from '../assistantAi'
import { track } from '../analytics'

// Floating in-app assistant. A bottom-right launcher opens a chat panel where
// the user describes what they want to do, and Claude Haiku points them to the
// right feature with one-tap navigation buttons.

const SUGGESTIONS = {
  en: [
    'Where do I add a trade?',
    'Is my portfolio too risky?',
    'How do I plan when to sell?',
    'How do I back up my data?',
  ],
  ar: [
    'أين أضيف صفقة؟',
    'هل محفظتي عالية المخاطر؟',
    'كيف أخطط لوقت البيع؟',
    'كيف أنسخ بياناتي احتياطياً؟',
  ],
}

// ── Minimal markdown rendering for assistant replies ────────────────────────
// The model replies with light markdown (**bold**, *italic*, `code`, and "- "
// bullet lists). We render a safe subset as React nodes — no dangerouslySet
// HTML — so the chat doesn't show raw asterisks.
function renderInline(text) {
  const nodes = []
  const re = /\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|_(.+?)_/g
  let last = 0, m, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] != null) nodes.push(<strong key={k++}>{m[1]}</strong>)
    else if (m[2] != null) nodes.push(<code key={k++} className="wlc-md-code">{m[2]}</code>)
    else if (m[3] != null) nodes.push(<em key={k++}>{m[3]}</em>)
    else if (m[4] != null) nodes.push(<em key={k++}>{m[4]}</em>)
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function MarkdownText({ text }) {
  const lines = String(text || '').split('\n')
  const blocks = []
  let list = null
  for (const line of lines) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    if (bullet) {
      if (!list) list = []
      list.push(bullet[1])
      continue
    }
    if (list) { blocks.push({ type: 'ul', items: list }); list = null }
    if (line.trim()) blocks.push({ type: 'p', text: line })
  }
  if (list) blocks.push({ type: 'ul', items: list })
  return blocks.map((b, i) =>
    b.type === 'ul'
      ? <ul key={i} className="wlc-md-list">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>
      : <p key={i} className="wlc-md-p">{renderInline(b.text)}</p>
  )
}

// Turn a "/dashboard?tab=ai" style route into navigate(path, { state }).
function go(navigate, route) {
  const [path, query] = route.split('?')
  const state = {}
  if (query) {
    const params = new URLSearchParams(query)
    const tab = params.get('tab')
    if (tab) state.tab = tab
  }
  navigate(path, Object.keys(state).length ? { state } : undefined)
}

const FAB_SIZE = 56
const POS_KEY = 'wl_assistant_fab_pos'
const DRAG_THRESHOLD = 6 // px before a press counts as a drag (vs a tap)

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p
  } catch {}
  return null
}

function clampPos(x, y) {
  const maxX = window.innerWidth - FAB_SIZE - 8
  const maxY = window.innerHeight - FAB_SIZE - 8
  return { x: Math.max(8, Math.min(maxX, x)), y: Math.max(8, Math.min(maxY, y)) }
}

// Position the panel near the fab, opening above/below and clamped on-screen.
function panelStyleFor(pos) {
  const vw = window.innerWidth, vh = window.innerHeight
  const gap = 12
  const panelW = Math.min(380, vw - 16)
  let left = pos.x + FAB_SIZE - panelW           // align right edges by default
  left = Math.max(8, Math.min(vw - panelW - 8, left))
  const openAbove = pos.y > vh / 2
  const style = { left: `${left}px`, right: 'auto', width: `${panelW}px` }
  if (openAbove) {
    const bottom = vh - pos.y + gap
    style.bottom = `${bottom}px`; style.top = 'auto'
    style.maxHeight = `${Math.max(220, vh - bottom - 16)}px`
  } else {
    const top = pos.y + FAB_SIZE + gap
    style.top = `${top}px`; style.bottom = 'auto'
    style.maxHeight = `${Math.max(220, vh - top - 16)}px`
  }
  style.height = 'auto'
  return style
}

export default function AssistantChat() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // { role, text, navs }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState(loadPos) // null = default bottom-right (CSS)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fabRef = useRef(null)
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 })

  const isAr = lang === 'ar'

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [messages, open, loading])

  // Keep the fab inside the viewport on resize/orientation change.
  useEffect(() => {
    if (!pos) return
    const onResize = () => setPos(p => (p ? clampPos(p.x, p.y) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos])

  function onFabPointerDown(e) {
    const rect = fabRef.current.getBoundingClientRect()
    drag.current = {
      active: true, moved: false,
      startX: e.clientX, startY: e.clientY,
      offX: e.clientX - rect.left, offY: e.clientY - rect.top,
    }
    try { fabRef.current.setPointerCapture(e.pointerId) } catch {}
  }
  function onFabPointerMove(e) {
    const d = drag.current
    if (!d.active) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    setPos(clampPos(e.clientX - d.offX, e.clientY - d.offY))
  }
  function onFabPointerUp(e) {
    const d = drag.current
    if (!d.active) return
    d.active = false
    try { fabRef.current.releasePointerCapture(e.pointerId) } catch {}
    if (d.moved) {
      setPos(p => { if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {} } return p })
    }
  }
  function onFabClick() {
    // Suppress the click that follows a drag so dragging never toggles the panel.
    if (drag.current.moved) { drag.current.moved = false; return }
    setOpen(o => !o)
    if (!open) track('assistant_open')
  }

  async function send(text) {
    const trimmed = (text ?? input).trim()
    if (!trimmed || loading) return
    setError(null)
    setInput('')

    const nextMsgs = [...messages, { role: 'user', text: trimmed }]
    setMessages(nextMsgs)
    setLoading(true)
    track('assistant_message')

    try {
      const history = nextMsgs.map(m => ({ role: m.role, content: m.text }))
      const raw = await chatWithAssistant(history, { lang })
      const { text: replyText, navs } = parseAssistantReply(raw)
      setMessages(m => [...m, { role: 'assistant', text: replyText, navs }])
    } catch (e) {
      setError(e.code === 'unavailable' ? 'unavailable' : 'failed')
    } finally {
      setLoading(false)
    }
  }

  function handleNav(route) {
    track('assistant_nav', { route })
    go(navigate, route)
    setOpen(false)
  }

  const greeting = isAr
    ? 'مرحباً! أنا مساعد WalletLens. أخبرني بما تريد فعله وسأوجهك للميزة المناسبة.'
    : "Hi! I'm the WalletLens assistant. Tell me what you'd like to do and I'll point you to the right feature."

  return (
    <>
      <button
        ref={fabRef}
        className={`wlc-fab ${open ? 'wlc-fab-open' : ''} ${drag.current.moved ? 'wlc-fab-dragging' : ''}`}
        style={pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : undefined}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onClick={onFabClick}
        aria-label={isAr ? 'المساعد' : 'Assistant'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        )}
      </button>

      {open && (
        <div className="wlc-panel" role="dialog" aria-label="WalletLens assistant" style={pos ? panelStyleFor(pos) : undefined}>
          <div className="wlc-header">
            <div className="wlc-header-title">
              <span className="wlc-dot" />
              {isAr ? 'مساعد WalletLens' : 'WalletLens Assistant'}
            </div>
            <button className="wlc-close" onClick={() => setOpen(false)} aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
            </button>
          </div>

          <div className="wlc-scroll" ref={scrollRef}>
            <div className="wlc-msg wlc-msg-assistant">{greeting}</div>

            {messages.length === 0 && (
              <div className="wlc-suggestions">
                {(SUGGESTIONS[lang] || SUGGESTIONS.en).map((s, i) => (
                  <button key={i} className="wlc-suggestion" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`wlc-msg wlc-msg-${m.role}`}>
                {m.text && (
                  <div className="wlc-msg-text">
                    {m.role === 'assistant' ? <MarkdownText text={m.text} /> : m.text}
                  </div>
                )}
                {m.navs?.length > 0 && (
                  <div className="wlc-navs">
                    {m.navs.map((n, j) => (
                      <button key={j} className="wlc-nav-btn" onClick={() => handleNav(n.route)}>
                        {n.label}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="wlc-msg wlc-msg-assistant wlc-typing">
                <span className="wlc-typing-dot" /><span className="wlc-typing-dot" /><span className="wlc-typing-dot" />
              </div>
            )}

            {error === 'unavailable' && (
              <div className="wlc-error">{isAr ? 'المساعد غير متاح حالياً. حاول لاحقاً.' : 'The assistant is temporarily unavailable. Please try again later.'}</div>
            )}
            {error === 'failed' && (
              <div className="wlc-error">{isAr ? 'تعذّر الاتصال. حاول مرة أخرى.' : 'Could not reach the assistant. Please try again.'}</div>
            )}
          </div>

          <form className="wlc-input-row" onSubmit={e => { e.preventDefault(); send() }}>
            <input
              ref={inputRef}
              className="wlc-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isAr ? 'بماذا يمكنني مساعدتك؟' : 'What can I help you find?'}
              disabled={loading}
            />
            <button className="wlc-send" type="submit" disabled={loading || !input.trim()} aria-label="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
