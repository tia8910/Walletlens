import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import {
  chatWithAssistant, parseAssistantReply,
  loadChatHistory, saveChatHistory, addMessageToHistory,
  createConversation, clearChatHistory,
} from '../assistantAi'
import { track } from '../analytics'

// Floating in-app assistant. A bottom-right launcher opens a chat panel where
// the user describes what they want to do, and the AI points them to the right
// feature with one-tap navigation buttons. Chat history persists across sessions.

const SUGGESTIONS = {
  en: [
    'How is my portfolio doing?',
    'Is my portfolio too risky?',
    'How do I set price alerts?',
    'How do I back up my data?',
    'What should I buy next?',
    'Explain technical analysis',
    'How do I import from Excel?',
    'How do I plan when to sell?',
    'What are whale movements?',
    'How do I use voice import?',
    'What is the Fear & Greed Index?',
    'How do I rebalance my portfolio?',
  ],
  ar: [
    'كيف أداء محفظتي؟',
    'هل محفظتي عالية المخاطر؟',
    'كيف أضبط تنبيهات الأسعار؟',
    'كيف أنسخ بياناتي؟',
    'ماذا يجب أن أشتري؟',
    'اشرح لي التحليل الفني',
    'كيف أستورد من Excel؟',
    'كيف أخطط لوقت البيع؟',
    'ما هي حركة الحيتان؟',
    'كيف أستخدم الاستيراد الصوتي؟',
    'ما هو مؤشر الخوف والطمع؟',
    'كيف أعيد توزيع محفظتي؟',
  ],
}

// ── Minimal markdown rendering ─────────────────────────────────────────────
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
    const tool = params.get('tool')
    if (tab) state.tab = tab
    if (tool) state.tool = tool
  }
  navigate(path, Object.keys(state).length ? { state } : undefined)
}

const FAB_SIZE = 56
const POS_KEY = 'wl_assistant_fab_pos'
const DRAG_THRESHOLD = 6

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

function panelStyleFor(pos) {
  const vw = window.innerWidth, vh = window.innerHeight
  const gap = 12
  const panelW = Math.min(380, vw - 16)
  let left = pos.x + FAB_SIZE - panelW
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
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pos, setPos] = useState(loadPos)
  const [convId, setConvId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [conversations, setConversations] = useState([])
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fabRef = useRef(null)
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, offX: 0, offY: 0 })

  const isAr = lang === 'ar'

  // Load saved history on mount
  useEffect(() => {
    const saved = loadChatHistory()
    setConversations(saved)
    // Restore the last conversation
    if (saved.length > 0) {
      const last = saved[saved.length - 1]
      setConvId(last.id)
      setMessages(last.messages || [])
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading, open])

  // Sync conversations list when messages change
  useEffect(() => {
    setConversations(loadChatHistory())
  }, [messages])

  // ── Drag handling ──────────────────────────────────────────────────────
  function onFabPointerDown(e) {
    drag.current = { active: true, moved: false, startX: e.clientX, startY: e.clientY, offX: 0, offY: 0 }
    if (pos) { drag.current.offX = e.clientX - pos.x; drag.current.offY = e.clientY - pos.y }
  }
  function onFabPointerMove(e) {
    if (!drag.current.active) return
    const dx = e.clientX - drag.current.startX, dy = e.clientY - drag.current.startY
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.current.moved = true
    if (!drag.current.moved) return
    const x = (pos?.x ?? (window.innerWidth - FAB_SIZE - 16)) + (e.clientX - drag.current.startX - drag.current.offX + (drag.current.startX - (pos?.x ?? 0)))
    const y = (pos?.y ?? (window.innerHeight - FAB_SIZE - 16)) + (e.clientY - drag.current.startY - drag.current.offY + (drag.current.startY - (pos?.y ?? 0)))
    setPos(clampPos(e.clientX - drag.current.offX, e.clientY - drag.current.offY))
  }
  function onFabPointerUp() {
    if (!drag.current.moved) { setOpen(o => !o); setShowHistory(false) }
    else {
      const p = clampPos(
        parseInt(fabRef.current?.style?.left) || window.innerWidth - FAB_SIZE - 16,
        parseInt(fabRef.current?.style?.top) || window.innerHeight - FAB_SIZE - 16,
      )
      setPos(p)
      try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch {}
    }
    drag.current.active = false
  }
  function onFabClick() { if (drag.current.moved) return }

  // ── Send message ───────────────────────────────────────────────────────
  async function send(text) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)

    // Create conversation if needed
    let cid = convId
    if (!cid) {
      cid = `wc_${Date.now()}`
      createConversation(cid)
      setConvId(cid)
    }

    const userMsg = { role: 'user', text: msg }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    addMessageToHistory(cid, { role: 'user', content: msg })

    setLoading(true)
    try {
      const apiMessages = newMessages.slice(-20).map(m => ({ role: m.role, content: m.text || m.content || '' }))
      const rawReply = await chatWithAssistant(apiMessages, { lang })
      const { text: replyText, navs } = parseAssistantReply(rawReply)
      const assistantMsg = { role: 'assistant', text: replyText, navs }
      setMessages(prev => [...prev, assistantMsg])
      addMessageToHistory(cid, { role: 'assistant', content: replyText, navs })
      track('assistant_reply', { msgLen: replyText.length, navCount: navs.length })
    } catch (err) {
      setError(err.code || 'failed')
      track('assistant_error', { code: err.code })
    } finally {
      setLoading(false)
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  function handleNav(route) {
    go(navigate, route)
    setOpen(false)
  }

  // ── Conversation management ────────────────────────────────────────────
  function startNewChat() {
    const cid = `wc_${Date.now()}`
    createConversation(cid)
    setConvId(cid)
    setMessages([])
    setShowHistory(false)
    setConversations(loadChatHistory())
    inputRef.current?.focus()
  }

  function selectConversation(id) {
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      setConvId(id)
      setMessages(conv.messages || [])
      setShowHistory(false)
    }
  }

  function handleClearHistory() {
    clearChatHistory()
    setConversations([])
    startNewChat()
  }

  const greeting = isAr
    ? 'مرحباً! أنا مساعد WalletLens. أخبرني بما تريد فعله وسأوجهك للميزة المناسبة.'
    : "Hi! I'm the WalletLens assistant. Ask me anything about the app, your portfolio, or investing."

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
          {/* ── Header ── */}
          <div className="wlc-header">
            <button className="wlc-history-btn" onClick={() => { if (showHistory) setShowHistory(false); else setOpen(false); }} title={isAr ? 'رجوع' : 'Back'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="wlc-header-title">
              <span className="wlc-dot" />
              {isAr ? 'مساعد WalletLens' : 'WalletLens Assistant'}
            </div>
            <button className="wlc-new-chat-btn" onClick={startNewChat} title={isAr ? 'محادثة جديدة' : 'New chat'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button className="wlc-close" onClick={() => setOpen(false)} aria-label="Close">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>
            </button>
          </div>

          {/* ── History panel ── */}
          {showHistory && (
            <div className="wlc-history-panel">
              <div className="wlc-history-list">
                {conversations.length === 0 && (
                  <div className="wlc-history-empty">{isAr ? 'لا توجد محادثات' : 'No conversations yet'}</div>
                )}
                {[...conversations].reverse().map(conv => {
                  const preview = conv.messages?.length > 0
                    ? (conv.messages[conv.messages.length - 1].content || conv.messages[conv.messages.length - 1].text || '').slice(0, 50)
                    : ''
                  const time = new Date(conv.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  return (
                    <button key={conv.id} className={`wlc-history-item${conv.id === convId ? ' active' : ''}`} onClick={() => selectConversation(conv.id)}>
                      <div className="wlc-history-preview">{preview || (isAr ? 'محادثة جديدة' : 'New chat')}</div>
                      <div className="wlc-history-time">{time}</div>
                    </button>
                  )
                })}
              </div>
              {conversations.length > 0 && (
                <button className="wlc-history-clear" onClick={handleClearHistory}>
                  {isAr ? 'مسح السجل' : 'Clear History'}
                </button>
              )}
            </div>
          )}

          {/* ── Messages ── */}
          <div className="wlc-scroll" ref={scrollRef}>
            <div className="wlc-msg wlc-msg-assistant">{greeting}</div>

            {messages.length === 0 && !showHistory && (
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

          {/* ── Input ── */}
          <form className="wlc-input-row" onSubmit={e => { e.preventDefault(); send() }}>
            <input
              ref={inputRef}
              className="wlc-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isAr ? 'بماذا يمكنني مساعدتك؟' : 'Ask me anything...'}
              disabled={loading}
            />
            <button className="wlc-send" type="submit" disabled={loading || !input.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a1 1 0 0 0-1.39 1.02L3.1 11 13 12l-9.9 1 -1.09 6.38a1 1 0 0 0 1.39 1.02z"/></svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
