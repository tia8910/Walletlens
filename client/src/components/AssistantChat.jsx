import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../LanguageContext'
import {
  parseAssistantReply,
  loadChatHistory, saveChatHistory, addMessageToHistory,
  createConversation, clearChatHistory,
} from '../assistantAi'
import { track } from '../analytics'
import { api } from '../api'
import AiReport from './AiReport'

// The answering engine carries the whole glossary and FAQ (~45 KB gzipped).
// The chat bubble mounts on every app page, but almost nobody opens it, so the
// engine is fetched when the panel opens (or a question is asked), not with
// the bubble. Importing it statically put both datasets on every dashboard load.
const loadLocalAssistant = () => import('../localAssistant')

// What the chat says when an answer does not come, by what went wrong.
const ERROR_COPY = {
  offline: ["You're offline. Connect to the internet and try again.", 'أنت غير متصل. اتصل بالإنترنت وحاول مرة أخرى.'],
  network: ['Could not reach the assistant. Check your connection and try again.', 'تعذّر الوصول إلى المساعد. تحقق من الاتصال وحاول مرة أخرى.'],
  busy: ['Too many questions in a short time. Wait a minute, then try again.', 'أسئلة كثيرة في وقت قصير. انتظر دقيقة ثم حاول مرة أخرى.'],
  upstream: ['The AI service is busy right now. Try again in a moment.', 'خدمة الذكاء الاصطناعي مشغولة الآن. حاول بعد لحظات.'],
  unavailable: ['The assistant is switched off on the server right now. Please try again later.', 'المساعد متوقف على الخادم حالياً. حاول لاحقاً.'],
  failed: ['Something went wrong getting an answer. Please try again.', 'حدث خطأ أثناء جلب الإجابة. حاول مرة أخرى.'],
}

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
  const { t } = useLanguage()
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
  // Clearing every conversation asks for a second tap; it cannot be undone.
  const [confirmClear, setConfirmClear] = useState(false)
  useEffect(() => { if (!showHistory) setConfirmClear(false) }, [showHistory])
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

  // Keep the current showHistory value readable inside the popstate handler,
  // whose closure is set up once (deps: [open]) and would otherwise go stale.
  const showHistoryRef = useRef(false)
  useEffect(() => { showHistoryRef.current = showHistory }, [showHistory])

  // Fetch the answering engine as soon as the panel opens, so it is ready by
  // the time a question is typed.
  useEffect(() => { if (open) loadLocalAssistant().catch(() => {}) }, [open])

  // Hardware / browser Back button. Critical in the Android TWA: without this,
  // pressing Back while the chat is open navigates the WebView away (or exits
  // the app) instead of closing the panel. We push a history entry when the
  // panel opens so Back has something to pop: the first Back closes the history
  // sub-view (returning to the chat), the next closes the panel. Closing via the
  // UI consumes the pushed entry so it doesn't swallow a later Back press.
  useEffect(() => {
    if (!open) return
    window.history.pushState({ wlcAssistant: true }, '')
    const onPop = () => {
      if (showHistoryRef.current) {
        setShowHistory(false)
        window.history.pushState({ wlcAssistant: true }, '')
      } else {
        setOpen(false)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (window.history.state?.wlcAssistant) window.history.back()
    }
  }, [open])

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
  async function send(text, { retry = false } = {}) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setError(null)
    if (retry) return ask(messages)

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
    return ask(newMessages, cid)
  }

  // Ask the server about a conversation whose last message is the user's.
  // Retry calls this directly, so the question is not added twice.
  async function ask(newMessages, cid = convId) {
    setLoading(true)
    try {
      // Answered on the device from the portfolio, the app's pages, the
      // glossary and the FAQ: no server, no AI model, works offline.
      const question = newMessages[newMessages.length - 1]?.text || ''
      const holdings = await Promise.resolve(api.getPortfolio()).catch(() => [])
      const list = Array.isArray(holdings) ? holdings : []
      const prices = api.getCachedPrices?.(list.map(h => h.coin_id).join(',')) || {}
      const [{ answerLocally }] = await Promise.all([
        loadLocalAssistant(),
        new Promise(r => setTimeout(r, 250)), // a beat, so the reply does not flash in
      ])
      const rawReply = answerLocally(question, { lang, holdings: list, prices })
      const { text: replyText, navs } = parseAssistantReply(rawReply)
      // Answered on the device, not by an AI model: no AI label or report button.
      const assistantMsg = { role: 'assistant', text: replyText, navs, local: true }
      setMessages(prev => [...prev, assistantMsg])
      addMessageToHistory(cid, { role: 'assistant', content: replyText, navs, local: true })
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
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    clearChatHistory()
    setConversations([])
    startNewChat()
  }

  // The bubble floats over whatever is under it (a row's Edit link, a tile, a
  // form field). While someone scrolls down to read it steps aside, and comes
  // back when they scroll up or stop: the content is theirs first.
  const [away, setAway] = useState(false)
  useEffect(() => {
    let last = 0, idle = null
    const onScroll = () => {
      // The page's own scroll only: the price ticker scrolls sideways all the time.
      const y = window.scrollY || 0, dy = y - last
      last = y
      if (Math.abs(dy) < 6) return
      setAway(dy > 0 && y > 80)
      clearTimeout(idle)
      idle = setTimeout(() => setAway(false), 1200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { clearTimeout(idle); window.removeEventListener('scroll', onScroll) }
  }, [])

  const greeting = isAr
    ? 'مرحباً! أنا مساعد WalletLens. أخبرني بما تريد فعله وسأوجهك للميزة المناسبة.'
    : "Hi! I'm the WalletLens assistant. Ask me anything about the app, your portfolio, or investing."

  return (
    <>
      <button
        ref={fabRef}
        className={`wlc-fab ${open ? 'wlc-fab-open' : ''} ${drag.current.moved ? 'wlc-fab-dragging' : ''} ${away && !open ? 'wlc-fab-away' : ''}`}
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
        <div className="wlc-panel" role="dialog" aria-label={t('atAssistant')} style={pos ? panelStyleFor(pos) : undefined}>
          {/* ── Header ── */}
          <div className="wlc-header">
            <button className="wlc-history-btn" onClick={() => setShowHistory(h => !h)} title={isAr ? (showHistory ? 'رجوع' : 'المحادثات') : (showHistory ? 'Back to chat' : 'Conversations')}>
              {showHistory ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>
              )}
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
              {/* Back to the chat, or a fresh one with the question menu,
                  without touching saved conversations. */}
              <div className="wlc-history-actions">
                <button type="button" className="wlc-history-back" onClick={() => setShowHistory(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                  {isAr ? 'العودة للمحادثة' : 'Back to chat'}
                </button>
                <button type="button" className="wlc-history-new" onClick={startNewChat}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  {isAr ? 'محادثة جديدة' : 'New chat'}
                </button>
              </div>
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
                <button type="button" className={`wlc-history-clear${confirmClear ? ' armed' : ''}`} onClick={handleClearHistory}>
                  {confirmClear
                    ? (isAr ? 'اضغط مرة أخرى لحذف كل المحادثات' : 'Tap again to delete all conversations')
                    : (isAr ? 'مسح السجل' : 'Clear history')}
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
                {m.role === 'assistant' && m.text && !m.local && <AiReport surface="assistant" output={m.text} compact />}
              </div>
            ))}

            {loading && (
              <div className="wlc-msg wlc-msg-assistant wlc-typing">
                <span className="wlc-typing-dot" /><span className="wlc-typing-dot" /><span className="wlc-typing-dot" />
              </div>
            )}

            {error && (
              <div className="wlc-error" role="alert">
                <span>{(ERROR_COPY[error] || ERROR_COPY.failed)[isAr ? 1 : 0]}</span>
                {error !== 'unavailable' && messages[messages.length - 1]?.role === 'user' && (
                  <button type="button" className="wlc-retry" onClick={() => send(messages[messages.length - 1].text, { retry: true })} disabled={loading}>
                    {isAr ? 'إعادة المحاولة' : 'Try again'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Input ── */}
          {/* The question menu stays one tap away once a chat has started;
              before, the only way back to it was clearing the history. */}
          {messages.length > 0 && !showHistory && !loading && (
            <div className="wlc-quick" role="group" aria-label={isAr ? 'أسئلة مقترحة' : 'Suggested questions'}>
              {(SUGGESTIONS[lang] || SUGGESTIONS.en).map((s, i) => (
                <button key={i} type="button" className="wlc-quick-chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}
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
