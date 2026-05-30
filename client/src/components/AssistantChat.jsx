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

export default function AssistantChat() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([]) // { role, text, navs }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const isAr = lang === 'ar'

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [messages, open, loading])

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
        className={`wlc-fab ${open ? 'wlc-fab-open' : ''}`}
        onClick={() => { setOpen(o => !o); if (!open) track('assistant_open') }}
        aria-label={isAr ? 'المساعد' : 'Assistant'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        )}
      </button>

      {open && (
        <div className="wlc-panel" role="dialog" aria-label="WalletLens assistant">
          <div className="wlc-header">
            <div className="wlc-header-title">
              <span className="wlc-dot" />
              {isAr ? 'مساعد WalletLens' : 'WalletLens Assistant'}
            </div>
            <button className="wlc-close" onClick={() => setOpen(false)} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
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
                {m.text && <div className="wlc-msg-text">{m.text}</div>}
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
