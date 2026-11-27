import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { answerLocally, words, valueHoldings } from './localAssistant'

// The assistant answers on the device, from the portfolio, the app's pages,
// the glossary and the FAQ, with no server and no AI model.
const here = dirname(fileURLToPath(import.meta.url))
const holdings = [
  { coin_id: 'metal:xau', coin_symbol: 'XAU', coin_name: 'Gold (1 oz)', amount: 1.44, total_invested: 3900 },
  { coin_id: 'ethereum', coin_symbol: 'ETH', coin_name: 'Ethereum', amount: 1, total_invested: 2200 },
  { coin_id: 'aptos', coin_symbol: 'APT', coin_name: 'Aptos', amount: 2000, total_invested: 1500 },
  { coin_id: 'bond:us treasury 10y', coin_symbol: 'US TREASURY 10Y', coin_name: 'US Treasury 10Y', amount: 1, total_invested: 55 },
]
const prices = {
  'metal:xau': { usd: 3880, usd_24h_change: -0.5 },
  ethereum: { usd: 1834, usd_24h_change: 1.2 },
  aptos: { usd: 0.458, usd_24h_change: -3.4 },
  'bond:us treasury 10y': { usd: 55, usd_24h_change: 0 },
}
const ask = (q, lang = 'en') => answerLocally(q, { lang, holdings, prices })
const navs = (r) => [...r.matchAll(/\[\[nav:([^|\]]+)\|/g)].map(m => m[1])

describe('the on-device assistant', () => {
  it('answers what the portfolio is worth, from the holdings', () => {
    const r = ask('What is my portfolio worth?')
    const total = valueHoldings(holdings, prices).reduce((s, h) => s + h.value, 0)
    expect(r).toMatch(/Your portfolio is worth \$8,392 across 4 holdings/)
    expect(Math.round(total)).toBe(8392)
    expect(navs(r)).toContain('/dashboard')
  })
  it('answers today, the biggest holdings and the mix', () => {
    expect(ask('How am I doing today?')).toMatch(/Today you are .* Leading: ETH \+1\.20%\. Trailing: APT -3\.40%\./)
    expect(ask('What are my biggest holdings?')).toMatch(/- XAU: \$5,587/)
    const mix = ask('Show my allocation')
    expect(mix).toMatch(/Precious metals: 66\.6%/)
    expect(mix).toMatch(/Bonds: 0\.7%/)
  })
  it('answers about one holding by name or ticker', () => {
    const r = ask('How is my ETH doing?')
    expect(r).toMatch(/^Ethereum \(ETH\): 1 worth \$1,834, 21\.9% of your portfolio/)
    expect(navs(r)).toEqual(['/asset/ethereum'])
  })
  it('finds the page for what someone wants to do', () => {
    expect(ask('How do I set a price alert?')).toMatch(/rises above/)
    expect(navs(ask('How do I set a price alert?'))[0]).toBe('/dashboard?tab=alerts')
    expect(ask('How do I rebalance my portfolio?')).toMatch(/Rebalancing Tool/)
    expect(ask('Can I import from a spreadsheet?')).toMatch(/Import from Excel/)
    expect(ask('change the theme to dark')).toMatch(/Settings/)
  })
  it('explains adding a holding', () => {
    expect(ask('How do I add a coin?')).toMatch(/Tap the \+ button/)
  })
  it('explains a term from the glossary', () => {
    const r = ask('What is cost basis?')
    expect(r).toMatch(/^Cost Basis: /)
    expect(navs(r)).toEqual(['/learn/cost-basis'])
  })
  it('falls back to the FAQ, then to suggestions', () => {
    expect(ask('Is WalletLens really free?')).toMatch(/More in the FAQ/)
    expect(ask('zzqx blorp')).toMatch(/I'm not sure about that one/)
  })
  it('answers in Arabic', () => {
    expect(ask('كم قيمة محفظتي؟', 'ar')).toMatch(/قيمة محفظتك \$8,392/)
  })
  it('says how to start when there is nothing held', () => {
    expect(answerLocally('What is my portfolio worth?', { holdings: [] })).toMatch(/You don't have any holdings yet/)
  })
  it('drops filler and endings from words', () => {
    expect(words('How do I set the alerts?')).toEqual(['set', 'alert'])
  })
  it('is what the chat uses, with no server call and no AI label', () => {
    const chat = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
    expect(chat).toMatch(/const rawReply = answerLocally\(question, \{ lang, holdings: list, prices \}\)/)
    expect(chat).not.toMatch(/chatWithAssistant\(/)
    expect(chat).toMatch(/!m\.local && <AiReport surface="assistant"/)
  })
  it('is fetched by the chat on demand, not with the bubble on every page', () => {
    // localAssistant pulls in the glossary and FAQ (~45 KB gzipped). A static
    // import put both on every dashboard load, for a panel few people open.
    const chat = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
    expect(chat).not.toMatch(/^import[^\n]*from '\.\.\/localAssistant'/m)
    expect(chat).toMatch(/import\('\.\.\/localAssistant'\)/)
  })
  it('gives no buy or sell advice, but points to the tools and the holding', () => {
    const r = ask('Should I sell ETH?')
    expect(r).toMatch(/^I can't tell you what to buy or sell/)
    expect(r).toMatch(/You hold ETH worth \$1,834/)
    expect(navs(r)).toContain('/asset/ethereum')
    expect(ask('Is bitcoin a good investment?')).toMatch(/^I can't tell you what to buy or sell/)
  })
  it('counts holdings and shows one button per page', () => {
    expect(ask('How many assets do I have?')).toMatch(/You hold 4 assets/)
    const r = ask('how to backup my portfolio')
    expect(new Set(navs(r)).size).toBe(navs(r).length)
  })
  it('says so when prices have not loaded, instead of a zero gain', () => {
    expect(answerLocally('What is my portfolio worth?', { holdings, prices: {} })).toMatch(/^Live prices have not loaded yet, so I can only count what you paid: \$7,655 across 4 holdings/)
  })
  it('understands everyday phrasings', () => {
    expect(ask('How is my portfolio doing?')).toMatch(/^Your portfolio is worth \$8,392 .*Today you are/s)
    expect(ask('give me an overview')).toMatch(/^Your portfolio is worth/)
    expect(ask('Am I making money?')).toMatch(/^Overall you are up/)
    expect(ask('which coin is up the most')).toMatch(/^Best today: ETH \+1\.20%/)
    expect(ask('how much did I invest')).toMatch(/^You have put in \$7,655/)
    expect(ask('how much is my gold worth')).toMatch(/^Gold \(1 oz\) \(XAU\)/)
    expect(ask('what percent is crypto')).toMatch(/Your mix/)
    expect(ask('what should I do')).toMatch(/^I can't tell you what to buy or sell/)
    expect(ask('how do I add bitcoin')).toMatch(/^Tap the \+ button/)
    expect(ask('how to sell')).toMatch(/^To sell, tap Sell/)
    expect(ask('how do I export to pdf')).toMatch(/Excel or PDF button/)
    expect(ask('change currency to euro')).toMatch(/currency button/)
    expect(ask('what is a bond')).toMatch(/^Bond: A bond is a loan/)
    expect(ask('How do I delete all my data?')).toMatch(/More in the FAQ/)
    expect(ask('how does the app make money')).toMatch(/More in the FAQ/)
    expect(ask('how do I add a price alert')).toMatch(/Price Alerts/)
    expect(ask('كيف أضيف عملة', 'ar')).toMatch(/^اضغط زر \+/)
  })
  it('answers every question the chat suggests, in English and Arabic', () => {
    const src = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
    const block = src.slice(src.indexOf('const SUGGESTIONS'), src.indexOf('// ── Minimal markdown'))
    const [enPart, arPart] = block.split('ar: [')
    for (const [lang, part] of [['en', enPart], ['ar', arPart]]) {
      const qs = [...part.matchAll(/'([^']+)'/g)].map(m => m[1])
      expect(qs.length).toBe(12)
      for (const q of qs) expect(ask(q, lang), q).not.toMatch(/I'm not sure about that one|لست متأكداً من ذلك/)
    }
    expect(ask('How do I plan when to sell?')).toMatch(/Sell Targets/)
  })
  it('keeps the question menu and the way back without clearing history', () => {
    const chat = readFileSync(join(here, 'components/AssistantChat.jsx'), 'utf8')
    expect(chat).toMatch(/messages\.length > 0 && !showHistory && !loading && \(\s*<div className="wlc-quick"/)
    expect(chat).toMatch(/className="wlc-history-back" onClick=\{\(\) => setShowHistory\(false\)\}/)
    expect(chat).toMatch(/className="wlc-history-new" onClick=\{startNewChat\}/)
    expect(chat).toMatch(/if \(!confirmClear\) \{ setConfirmClear\(true\); return \}/)
  })
})
