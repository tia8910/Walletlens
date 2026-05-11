import { useState, useRef, useEffect, memo } from 'react'

const KEY_STORAGE = 'walletlens_anthropic_key'
const MODEL = 'claude-opus-4-7'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

// Build compact portfolio context string for the AI
function buildContext({ portfolio, prices, transactions, coinTargets, totalValue, totalInvested, totalPnL }) {
  const holdings = (portfolio || []).map(h => {
    const price    = prices?.[h.coin_id]?.usd ?? prices?.[h.coin_id]?.price ?? 0
    const value    = h.amount * price
    const pnl      = value - h.total_invested
    const pnlPct   = h.total_invested > 0 ? ((pnl / h.total_invested) * 100).toFixed(1) : '0'
    const chg24    = prices?.[h.coin_id]?.usd_24h_change?.toFixed(2) ?? '?'
    const targets  = (coinTargets?.[h.coin_id]?.targets || []).map(t => `$${t.price}`).join(', ')
    return `${h.coin_symbol?.toUpperCase()} | amt:${h.amount} | price:$${price.toFixed(4)} (24h:${chg24}%) | val:$${value.toFixed(2)} | P&L:$${pnl.toFixed(2)} (${pnlPct}%)${targets ? ` | targets:${targets}` : ''}`
  }).join('\n')

  const txs = (transactions || []).slice(-15).map(tx =>
    `${tx.type?.toUpperCase()} ${tx.amount} ${tx.coin_symbol} @$${tx.price_per_unit} ${tx.created_at?.slice(0, 10) ?? ''}`
  ).join('\n')

  return `Portfolio: $${(totalValue || 0).toLocaleString()} value | $${(totalInvested || 0).toLocaleString()} invested | $${(totalPnL || 0).toLocaleString()} P&L | ${(portfolio || []).length} assets

Holdings:
${holdings || 'None'}

Recent transactions:
${txs || 'None'}`
}

const SYSTEM = `You are an elite crypto portfolio advisor — think CFA-level analyst with deep blockchain and market-cycle expertise. You have the user's complete portfolio: cost basis, unrealized P&L, sell targets, and transaction history.

Be specific, direct, and reference real numbers. Never give generic advice. Make clear calls. Use markdown for structure.`

const ANALYSIS_PROMPT = `Give me a comprehensive portfolio analysis with these exact sections:

## Portfolio Health: [Grade A+/A/B+/B/C/D] — [one-line verdict]
Honest one-paragraph assessment.

## 🔴 Top Risks
3–5 specific risks based on actual holdings. Reference asset names and concentrations.

## 🟢 Opportunities
3–5 specific opportunities or optimizations visible in this portfolio.

## ⚡ Priority Actions
3–5 concrete actions ranked by urgency. Name the asset, price level, and exact reasoning.

## 📊 Stress Test
- 🐻 Bear (BTC −50%): estimated total loss and worst positions
- 🦀 Sideways 6 months: opportunity cost observation
- 🐂 Bull (BTC +100%): estimated gain and best positions

## 💡 Contrarian Insight
One surprising insight most retail investors miss about this specific portfolio.`

async function callClaude(apiKey, messages, system, onChunk) {
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      stream: true,
      system,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `API error ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const ev = JSON.parse(data)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          onChunk(ev.delta.text)
        }
      } catch {}
    }
  }
}

// ── Markdown renderer (minimal, no deps) ─────────────────────────────────
function MarkdownText({ text }) {
  const lines = text.split('\n')
  const elements = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="ai-adv-h3">{line.slice(3)}</h3>)
    } else if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="ai-adv-h4">{line.slice(4)}</h4>)
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      elements.push(<li key={i} className="ai-adv-li">{inlineFormat(line.slice(2))}</li>)
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="ai-adv-spacer" />)
    } else {
      elements.push(<p key={i} className="ai-adv-p">{inlineFormat(line)}</p>)
    }
    i++
  }
  return <div className="ai-adv-md">{elements}</div>
}

function inlineFormat(text) {
  // **bold** and `code`
  const parts = []
  let remaining = text
  let key = 0
  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf('**')
    const codeIdx = remaining.indexOf('`')
    const first = Math.min(boldIdx === -1 ? Infinity : boldIdx, codeIdx === -1 ? Infinity : codeIdx)
    if (first === Infinity) { parts.push(remaining); break }
    if (first > 0) parts.push(remaining.slice(0, first))
    if (boldIdx !== -1 && boldIdx <= (codeIdx === -1 ? Infinity : codeIdx)) {
      const end = remaining.indexOf('**', boldIdx + 2)
      if (end === -1) { parts.push(remaining); break }
      parts.push(<strong key={key++}>{remaining.slice(boldIdx + 2, end)}</strong>)
      remaining = remaining.slice(end + 2)
    } else {
      const end = remaining.indexOf('`', codeIdx + 1)
      if (end === -1) { parts.push(remaining); break }
      parts.push(<code key={key++} className="ai-adv-code">{remaining.slice(codeIdx + 1, end)}</code>)
      remaining = remaining.slice(end + 1)
    }
  }
  return parts
}

// ── Chat message bubble ───────────────────────────────────────────────────
const ChatBubble = memo(function ChatBubble({ role, content }) {
  return (
    <div className={`ai-chat-bubble ai-chat-${role}`}>
      {role === 'assistant'
        ? <MarkdownText text={content} />
        : <p className="ai-adv-p">{content}</p>
      }
    </div>
  )
})

// ── Main component ────────────────────────────────────────────────────────
export default function AIAdvisor({ portfolio, prices, transactions, coinTargets, totalValue, totalInvested, totalPnL }) {
  const [apiKey, setApiKey]       = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [keyInput, setKeyInput]   = useState('')
  const [showKey, setShowKey]     = useState(false)
  const [mode, setMode]           = useState('analysis') // 'analysis' | 'chat'

  // Analysis state
  const [analysis, setAnalysis]   = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisErr, setAnalysisErr] = useState('')

  // Chat state
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatErr, setChatErr]     = useState('')
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, analysis])

  function saveKey() {
    const k = keyInput.trim()
    if (!k) return
    localStorage.setItem(KEY_STORAGE, k)
    setApiKey(k)
    setKeyInput('')
  }

  function removeKey() {
    localStorage.removeItem(KEY_STORAGE)
    setApiKey('')
  }

  const ctx = buildContext({ portfolio, prices, transactions, coinTargets, totalValue, totalInvested, totalPnL })
  const systemWithCtx = `${SYSTEM}\n\nCurrent portfolio context:\n${ctx}`

  async function runAnalysis() {
    if (!apiKey || analyzing) return
    setAnalyzing(true)
    setAnalysis('')
    setAnalysisErr('')
    try {
      await callClaude(
        apiKey,
        [{ role: 'user', content: ANALYSIS_PROMPT }],
        systemWithCtx,
        chunk => setAnalysis(prev => prev + chunk)
      )
    } catch (err) {
      setAnalysisErr(err.message)
    }
    setAnalyzing(false)
  }

  async function sendChat() {
    const text = input.trim()
    if (!text || chatLoading || !apiKey) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    const newHistory = [...messages, userMsg]
    setMessages([...newHistory, { role: 'assistant', content: '' }])
    setChatLoading(true)
    setChatErr('')
    try {
      await callClaude(
        apiKey,
        newHistory,
        systemWithCtx,
        chunk => setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: (copy[copy.length - 1]?.content || '') + chunk }
          return copy
        })
      )
    } catch (err) {
      setChatErr(err.message)
      setMessages(prev => prev.slice(0, -1))
    }
    setChatLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── API key setup screen ──────────────────────────────────────────────
  if (!apiKey) {
    return (
      <div className="ai-adv-setup glass-card">
        <div className="ai-adv-setup-icon">🤖</div>
        <h3 className="ai-adv-setup-title">AI Portfolio Advisor</h3>
        <p className="ai-adv-setup-sub">
          Powered by Claude — enter your Anthropic API key to get a CFA-level analysis of your portfolio.<br/>
          Your key is stored locally in your browser and sent only to Anthropic's API.
        </p>
        <div className="ai-adv-key-row">
          <input
            type={showKey ? 'text' : 'password'}
            placeholder="sk-ant-..."
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
            className="ai-adv-key-input"
          />
          <button className="ai-adv-key-eye" onClick={() => setShowKey(v => !v)}>
            {showKey ? '🙈' : '👁️'}
          </button>
        </div>
        <button className="dvx-btn dvx-btn-primary ai-adv-key-save" onClick={saveKey} disabled={!keyInput.trim()}>
          Save &amp; Continue
        </button>
        <p className="ai-adv-key-hint muted">
          Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:'#34d399'}}>console.anthropic.com</a>
        </p>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────
  return (
    <div className="ai-adv-root">
      {/* Mode toggle */}
      <div className="ai-adv-mode-bar">
        <button
          className={`ai-adv-mode-btn ${mode === 'analysis' ? 'active' : ''}`}
          onClick={() => setMode('analysis')}
        >
          📊 Deep Analysis
        </button>
        <button
          className={`ai-adv-mode-btn ${mode === 'chat' ? 'active' : ''}`}
          onClick={() => setMode('chat')}
        >
          💬 AI Chat
        </button>
        <button className="ai-adv-key-remove" onClick={removeKey} title="Remove API key">
          🔑
        </button>
      </div>

      {/* ── Analysis pane ── */}
      {mode === 'analysis' && (
        <div className="ai-adv-analysis-pane">
          {!analysis && !analyzing && (
            <div className="ai-adv-cta glass-card">
              <div className="ai-adv-cta-icon">🧠</div>
              <h3 className="ai-adv-cta-title">Portfolio Deep Dive</h3>
              <p className="ai-adv-cta-sub muted">
                Claude analyzes your actual holdings, cost basis, P&L, and sell targets to give you
                institutional-grade insights — risks, opportunities, priority actions, and stress tests.
              </p>
              <button className="dvx-btn dvx-btn-primary ai-adv-analyze-btn" onClick={runAnalysis}>
                ⚡ Analyze My Portfolio
              </button>
            </div>
          )}

          {analyzing && !analysis && (
            <div className="ai-adv-loading glass-card">
              <div className="ai-adv-spinner" />
              <p>Analyzing your portfolio with Claude Opus…</p>
            </div>
          )}

          {analysisErr && (
            <div className="ai-adv-error glass-card">
              <p>⚠️ {analysisErr}</p>
              <button className="dvx-btn" onClick={runAnalysis} style={{marginTop:'0.75rem'}}>Retry</button>
            </div>
          )}

          {analysis && (
            <div className="glass-card ai-adv-result">
              <div className="ai-adv-result-header">
                <span className="ai-badge">Claude Opus</span>
                <button className="ai-adv-refresh-btn" onClick={runAnalysis} disabled={analyzing} title="Re-analyze">
                  {analyzing ? '⏳' : '🔄'}
                </button>
              </div>
              <MarkdownText text={analysis} />
              {analyzing && <span className="ai-adv-cursor">▍</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Chat pane ── */}
      {mode === 'chat' && (
        <div className="ai-adv-chat-pane">
          <div className="ai-chat-log">
            {messages.length === 0 && (
              <div className="ai-chat-empty">
                <div className="ai-chat-empty-icon">💬</div>
                <p>Ask me anything about your portfolio.</p>
                <div className="ai-chat-suggestions">
                  {[
                    'Should I take profits on any position now?',
                    'Which holding is my biggest risk?',
                    'How should I rebalance for a bear market?',
                    'Explain my P&L situation',
                  ].map(s => (
                    <button key={s} className="ai-chat-suggestion" onClick={() => { setInput(s); inputRef.current?.focus() }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <ChatBubble key={i} role={m.role} content={m.content} />
            ))}
            {chatLoading && messages[messages.length - 1]?.content === '' && (
              <div className="ai-chat-bubble ai-chat-assistant ai-chat-thinking">
                <span className="ai-adv-dots"><span /><span /><span /></span>
              </div>
            )}
            {chatErr && <p className="ai-adv-error-inline">⚠️ {chatErr}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-input-row">
            <input
              ref={inputRef}
              className="ai-chat-input"
              placeholder="Ask about your portfolio…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              disabled={chatLoading}
            />
            <button
              className="ai-chat-send dvx-btn dvx-btn-primary"
              onClick={sendChat}
              disabled={chatLoading || !input.trim()}
            >
              {chatLoading ? '⏳' : '↑'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
