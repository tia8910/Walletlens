import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => readFileSync(join(here, f), 'utf8')

// Lazy chunks that render hidden were still fetched on every page load,
// because rendering a closed lazy() component downloads it. These pin the
// gates that keep them off the first-load critical path.
describe('first-load chunk gating', () => {
  it('mounts TradeSheet at idle (or when opened) on the dashboard', () => {
    const src = read('pages/Dashboard.jsx')
    expect(src).toMatch(/const sheetMounted = useIdleMount\(sheetOpen\)/)
    expect(src).toMatch(/\{sheetMounted && <Suspense fallback=\{null\}>\s*<TradeSheet/)
  })

  it('mounts TradeSheet at idle (or when opened) on transactions', () => {
    const src = read('pages/Transactions.jsx')
    expect(src).toMatch(/const tradeMounted = useIdleMount\(tradeOpen\)/)
    expect(src).toMatch(/\{tradeMounted && <Suspense fallback=\{null\}>\s*<TradeSheet/)
  })

  it('skips the welcome flow chunk for visitors who already completed it', () => {
    const app = read('App.jsx')
    expect(app).toMatch(/localStorage\.getItem\('wl_welcomed_v2'\)/)
    expect(app).toMatch(/!WELCOMED && <Suspense fallback=\{null\}><WelcomeModal \/>/)
    // Must match the key WelcomeModal itself records.
    expect(read('components/WelcomeModal.jsx')).toMatch(/const KEY = 'wl_welcomed_v2'/)
  })

  it('loads AiReport lazily inside the assistant chat', () => {
    const src = read('components/AssistantChat.jsx')
    expect(src).not.toMatch(/^import AiReport/m)
    expect(src).toMatch(/const AiReport = lazy\(\(\) => import\('\.\/AiReport'\)\)/)
  })

  it('carries no styles for the retired Academy quiz, wheel and guessr', () => {
    const css = read('index.css')
    expect(css).not.toMatch(/\.(guessr-|kw-|acad-iq|acad-toast|acad-badge)/)
  })
})
