import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalogue, parseHoldingsFromWords, parseNumber } from './screenshotParse.js'
import { IMPORT_COINS } from './data/importCoins.js'
import { POPULAR_TICKERS, PRESET_ASSETS } from './data/assets.js'

// The fixtures are real output of screenshotOcr.js: the on-device reader run
// in Chromium over phone-sized screenshots laid out like Binance (dark),
// Coinbase, MetaMask, Trust Wallet (dark) and a stock broker. Misreadings are
// kept as they came out ("Sul" for SUI, "2ETH", "uUsbDC", "=" for "≈").
const here = dirname(fileURLToPath(import.meta.url))
const words = (name) => JSON.parse(readFileSync(join(here, '__fixtures__/ocr', `${name}.words.json`), 'utf8'))

const COINS = [
  ['BTC', 'Bitcoin', 1, 67237], ['ETH', 'Ethereum', 2, 2609.6], ['USDT', 'Tether', 3, 1], ['BNB', 'BNB', 4, 581],
  ['SOL', 'Solana', 5, 152.2], ['USDC', 'USD Coin', 6, 1], ['DOGE', 'Dogecoin', 8, 0.158], ['TRX', 'TRON', 10, 0.341],
  ['LINK', 'Chainlink', 12, 17.95], ['WBTC', 'Wrapped Bitcoin', 14, 67200], ['TON', 'Toncoin', 15, 3.02],
  ['BCH', 'Bitcoin Cash', 18, 276], ['SUI', 'Sui', 20, 2.31], ['UNI', 'Uniswap', 30, 8.05], ['AR', 'Arweave', 100, 4.35],
  ['XAUT', 'Tether Gold', 200, 4140], ['ONE', 'Harmony', 300, 0.01], ['GAS', 'Gas', 400, 3],
  ['XAU', 'Gold', 0, 4141.93], ['AAPL', 'Apple', 0, 231], ['NVDA', 'NVIDIA', 0, 178], ['TSLA', 'Tesla', 0, 262],
]
const catalogue = (prices = true) => buildCatalogue(COINS.map(([symbol, name, rank, price]) => ({ symbol, name, rank, price: prices ? price : 0 })))
const brief = (rows) => rows.map(r => [r.symbol, Math.round(r.amount * 1e6) / 1e6, Math.round(r.price * 100) / 100])

// A line of words, laid out left to right at a given height.
function line(y, ...cells) {
  return cells.map(([x, text]) => ({ text, x0: x, x1: x + text.length * 12, y0: y, y1: y + 24 }))
}

describe('screenshots read on the device', () => {
  for (const prices of [true, false]) {
    describe(prices ? 'with market prices' : 'with no market prices', () => {
      it('Binance spot: ticker over name, amount over ≈ value; the headline total is not a holding', () => {
        expect(brief(parseHoldingsFromWords(words('binance'), catalogue(prices)))).toEqual([
          ['BTC', 0.125, 67237.04], ['ETH', 1.4821, 2610.63], ['BNB', 2.31, 581], ['USDT', 850.42, 1], ['SUI', 96.1, 2.31],
        ])
      })
      it('Coinbase: name over ticker, value over "0.1 BTC"', () => {
        expect(brief(parseHoldingsFromWords(words('coinbase'), catalogue(prices)))).toEqual([
          ['BTC', 0.1, 67237], ['ETH', 1.8, 2609.82], ['SOL', 7.25, 152.19], ['USDC', 300, 1], ['DOGE', 500, 0.16],
        ])
      })
      it('MetaMask: the change under the name is skipped, "2ETH" is two ETH', () => {
        expect(brief(parseHoldingsFromWords(words('metamask'), catalogue(prices)))).toEqual([
          ['ETH', 2, 2609.63], ['LINK', 25, 17.95], ['UNI', 24, 8.05],
        ])
      })
      it('Trust Wallet: price under the ticker, amount × price = value', () => {
        expect(brief(parseHoldingsFromWords(words('trust'), catalogue(prices)))).toEqual([
          ['BTC', 0.03, 67237], ['TRX', 1500, 0.34], ['TON', 149.37, 3.02],
        ])
      })
      it('a broker: "10 Shares" is the amount', () => {
        expect(brief(parseHoldingsFromWords(words('stocks'), catalogue(prices)))).toEqual([
          ['AAPL', 10, 231.24], ['NVDA', 4, 178.22], ['TSLA', 3.5, 262.3],
        ])
      })
    })
  }
})

describe('offline, with only what ships in the app', () => {
  // No coins.json, no prices: the bundled coins, metals and stock tickers.
  const offline = buildCatalogue([
    ...IMPORT_COINS,
    ...Object.values(PRESET_ASSETS).map(a => ({ symbol: a.symbol, name: a.name.replace(/\s*\(.*\)$/, ''), rank: 0 })),
    ...POPULAR_TICKERS.map(s => ({ symbol: s.ticker, name: s.name, rank: 5000 })),
  ])
  it('still reads every fixture', () => {
    expect(parseHoldingsFromWords(words('binance'), offline).map(r => r.symbol)).toEqual(['BTC', 'ETH', 'BNB', 'USDT', 'SUI'])
    expect(parseHoldingsFromWords(words('coinbase'), offline).map(r => r.symbol)).toEqual(['BTC', 'ETH', 'SOL', 'USDC', 'DOGE'])
    expect(parseHoldingsFromWords(words('metamask'), offline).map(r => r.symbol)).toEqual(['ETH', 'LINK', 'UNI'])
    expect(parseHoldingsFromWords(words('trust'), offline).map(r => r.symbol)).toEqual(['BTC', 'TRX', 'TON'])
    expect(parseHoldingsFromWords(words('stocks'), offline).map(r => r.symbol)).toEqual(['AAPL', 'NVDA', 'TSLA'])
  })
  it('the bundled list has no ticker twice and none of the screen words', () => {
    const syms = IMPORT_COINS.map(c => c.symbol)
    expect(new Set(syms).size).toBe(syms.length)
    expect(parseHoldingsFromWords(line(0, [0, 'NOT'], [80, 'now'], [200, '12']), offline)).toEqual([])
  })
})

describe('layouts with no fixture', () => {
  it('a one-line table with a header row: amount, price and value columns', () => {
    const w = [
      ...line(10, [0, 'Coin'], [200, 'Amount'], [400, 'Price'], [600, 'Value']),
      ...line(60, [0, 'BTC'], [200, '0.5'], [400, '67,000.00'], [600, '33,500.00']),
      ...line(100, [0, 'ETH'], [200, '3'], [400, '2,600.00'], [600, '7,800.00']),
    ]
    expect(brief(parseHoldingsFromWords(w, catalogue(false)))).toEqual([['BTC', 0.5, 67000], ['ETH', 3, 2600]])
  })

  it('a ticker strip or watchlist (price, no amount) adds nothing', () => {
    const w = [...line(10, [0, 'BCH'], [80, '$276.31'], [200, '0.10%']), ...line(60, [0, 'BTC'], [80, '$67,237'])]
    expect(parseHoldingsFromWords(w, catalogue(true))).toEqual([])
  })

  it('a value alone becomes an amount at the market price', () => {
    const w = line(10, [0, 'Arweave'], [400, '$1,174.31'])
    expect(brief(parseHoldingsFromWords(w, catalogue(true)))).toEqual([['AR', 269.956322, 4.35]])
    expect(parseHoldingsFromWords(w, catalogue(false))).toEqual([])
  })

  it('a sell in a trade history', () => {
    const w = line(10, [0, 'Sell'], [80, 'BTC/USDT'], [300, '0.01'], [400, '68,100.00'])
    expect(parseHoldingsFromWords(w, catalogue(true))).toMatchObject([{ symbol: 'BTC', amount: 0.01, price: 68100, type: 'sell' }])
  })

  it('a ticker beats a lone name beside it, and a longer name beats a shorter one', () => {
    const w = [...line(10, [0, 'Wrapped'], [100, 'Bitcoin'], [400, '$6,720.00']), ...line(40, [0, 'WBTC'], [400, '0.1'], [460, 'WBTC'])]
    expect(brief(parseHoldingsFromWords(w, catalogue(true)))).toEqual([['WBTC', 0.1, 67200]])
    const cash = line(10, [0, 'Bitcoin'], [100, 'Cash'], [300, '2'], [360, 'BCH'], [500, '$552.00'])
    expect(brief(parseHoldingsFromWords(cash, catalogue(true)))).toEqual([['BCH', 2, 276]])
  })

  it('screen words that are also tickers are not holdings', () => {
    const w = [...line(10, [0, 'ALL'], [100, '12']), ...line(60, [0, 'Gas'], [100, 'fee'], [200, '0.002']), ...line(110, [0, 'USD'], [100, '500.00'])]
    expect(parseHoldingsFromWords(w, catalogue(true))).toEqual([])
  })

  it("WalletLens's own list: a banner saying \"holdings\" twice is not a table header, and tab bar icons are not amounts", () => {
    const w = [
      ...line(100, [0, 'No'], [40, 'holdings'], [160, 'detected'], [300, 'in'], [340, 'any'], [400, 'screenshot.'], [560, 'Try'], [620, 'holdings'], [740, 'list.']),
      ...line(300, [200, 'Ethereum'], [700, '$26,096.00']),
      ...line(360, [200, '10'], [240, 'ETH'], [600, '$2,609.60']),
      ...line(480, [200, 'Bitcoin'], [700, '$33,618.50']),
      ...line(540, [200, '0.5BTC'], [600, '$67,237.00']),
      ...line(660, [200, 'Apple'], [700, '$2,310.00']),
      ...line(760, [260, '04'], [500, '88']),
      ...line(820, [200, 'Home'], [300, 'Signals'], [500, 'More']),
    ]
    expect(brief(parseHoldingsFromWords(w, catalogue(true)))).toEqual([['ETH', 10, 2609.6], ['BTC', 0.5, 67237], ['AAPL', 10, 231]])
    expect(brief(parseHoldingsFromWords(w, catalogue(false)))).toEqual([['ETH', 10, 2609.6], ['BTC', 0.5, 67237]])
  })

  it('an exchange order history: each card is a trade, with its side, filled amount, price and day', () => {
    // Bybit's layout: pair and date on top, Limit / Side, then labelled lines
    // reading "filled / total", OCR gluing the halves ("1,500.5/1,500.5", "250/").
    const card = (y, pair, date, side, amt, px) => [
      ...line(y, [0, pair], [700, date], [860, '12:30:00']),
      ...line(y + 60, [0, 'Limit'], [70, '/'], [90, side]),
      ...line(y + 140, [0, 'Amount'], [600, amt]),
      ...line(y + 200, [0, 'Price'], [600, px]),
      ...line(y + 260, [0, 'Status'], [700, 'Filled']),
    ]
    const w = [
      ...line(0, [0, 'Open'], [60, 'Orders'], [200, 'Order'], [270, 'History'], [420, 'Trade'], [490, 'History']),
      ...card(100, 'SOL/USDT', '2026-10-17', 'Sell', '1,500.5/1,500.5', '150.25/150.25'),
      ...card(500, 'ETH/USDT', '2026-10-16', 'Buy', '2/', '2,600.10'),
      ...card(900, 'ETH/USDT', '2026-10-15', 'Buy', '2/2', '2,580.00/2,580.00'),
    ]
    for (const prices of [true, false]) {
      expect(parseHoldingsFromWords(w, catalogue(prices))).toEqual([
        { symbol: 'SOL', name: 'Solana', amount: 1500.5, price: 150.25, type: 'sell', date: '2026-10-17', quote: 'USDT' },
        { symbol: 'ETH', name: 'Ethereum', amount: 2, price: 2600.1, type: 'buy', date: '2026-10-16', quote: 'USDT' },
        { symbol: 'ETH', name: 'Ethereum', amount: 2, price: 2580, type: 'buy', date: '2026-10-15', quote: 'USDT' },
      ])
    }
  })

  it('"7/7" is a page counter, not a figure', () => {
    expect(parseHoldingsFromWords(line(0, [0, 'Arweave'], [200, '7/7']), catalogue(false))).toEqual([])
  })

  it('nothing readable gives nothing', () => {
    expect(parseHoldingsFromWords([], catalogue())).toEqual([])
    expect(parseHoldingsFromWords(line(0, [0, 'Hello'], [100, 'world']), catalogue())).toEqual([])
  })
})

describe('parseNumber', () => {
  it('reads the ways a screen writes a number', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56)
    expect(parseNumber('1.234,56')).toBe(1234.56)
    expect(parseNumber('0,5')).toBe(0.5)
    expect(parseNumber('12,000')).toBe(12000)
    expect(parseNumber('1.174.31')).toBe(1174.31)
    expect(parseNumber('1.234.567')).toBe(1234567)
    expect(parseNumber('1.2K')).toBe(1200)
    expect(parseNumber('1O.5')).toBe(10.5)
    expect(parseNumber('abc')).toBeNaN()
  })
})
