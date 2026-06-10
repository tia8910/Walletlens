import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import CoinLogo from '../components/CoinLogo'
import { findCalculator } from '../data/calculators'
import { track } from '../analytics'

function fmtUSD(n) {
  const abs = Math.abs(n)
  if (abs >= 10000) return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (abs >= 1) return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return abs.toLocaleString('en-US', { maximumSignificantDigits: 4 })
}

function CalcWidget({ unit }) {
  const [qty, setQty] = useState('')
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')

  const q = parseFloat(qty) || 0
  const buy = parseFloat(buyPrice) || 0
  const sell = parseFloat(sellPrice) || 0
  const invested = q * buy
  const value = q * sell
  const profit = value - invested
  const roi = invested > 0 ? (profit / invested) * 100 : 0
  const hasResult = q > 0 && buy > 0 && sell > 0

  const qtyLabel = unit === 'shares' ? 'Number of shares' : unit === 'oz' ? 'Quantity (oz)' : `Quantity (${unit})`

  return (
    <div className="calc-widget">
      <div className="calc-inputs">
        <label className="calc-label">
          <span>{qtyLabel}</span>
          <input type="number" className="calc-input" placeholder="0" value={qty}
            onChange={e => setQty(e.target.value)} min="0" step="any" />
        </label>
        <label className="calc-label">
          <span>Buy / average cost price (USD)</span>
          <input type="number" className="calc-input" placeholder="0.00" value={buyPrice}
            onChange={e => setBuyPrice(e.target.value)} min="0" step="any" />
        </label>
        <label className="calc-label">
          <span>Target / sell price (USD)</span>
          <input type="number" className="calc-input" placeholder="0.00" value={sellPrice}
            onChange={e => setSellPrice(e.target.value)} min="0" step="any" />
        </label>
      </div>
      {hasResult ? (
        <div className="calc-results">
          <div className="calc-result-row">
            <span>Amount invested</span>
            <strong>${fmtUSD(invested)}</strong>
          </div>
          <div className="calc-result-row">
            <span>Value at target</span>
            <strong>${fmtUSD(value)}</strong>
          </div>
          <div className={`calc-result-row calc-pnl ${profit >= 0 ? 'calc-pos' : 'calc-neg'}`}>
            <span>Profit / Loss</span>
            <strong>{profit >= 0 ? '+' : '-'}${fmtUSD(profit)} ({profit >= 0 ? '+' : ''}{roi.toFixed(2)}%)</strong>
          </div>
          <div className="calc-result-row">
            <span>Break-even price</span>
            <strong>${fmtUSD(buy)}</strong>
          </div>
        </div>
      ) : (
        <p className="calc-hint">Fill in all three fields above to see your result.</p>
      )}
    </div>
  )
}

export default function Calculator() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const calc = findCalculator(slug)

  useEffect(() => {
    if (calc) track('calculator_view', { slug })
    else navigate('/dashboard', { replace: true })
  }, [calc, navigate, slug])

  if (!calc) return null

  const isStock = calc.type === 'stock'
  const isMetal = calc.type === 'metal'
  const isGeneral = calc.type === 'general'
  const isCrypto = !isStock && !isMetal && !isGeneral
  const assetLabel = isGeneral ? 'any asset' : calc.name
  const unitWord = calc.unit === 'oz' ? 'ounces' : calc.unit === 'shares' ? 'shares' : 'units'

  return (
    <div className="wl-app wl-app-landing">
      <main className="tc-page">
        <header className="tc-head">
          <Link to="/" className="tc-brand" aria-label="WalletLens home">
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          {calc.id && <CoinLogo symbol={calc.symbol} coinId={calc.id} size={56} className="tc-coin-logo" />}
          <h1 className="tc-h1">
            {calc.name}{isStock ? ' Stock' : ''} Profit Calculator — Free &amp; Instant
          </h1>
          <p className="tc-sub">{calc.blurb}</p>
          <CalcWidget unit={calc.unit} />
          <div className="tc-cta-row" style={{ marginTop: '1.4rem' }}>
            <button className="lp-cta-primary"
              onClick={() => { track('calculator_cta', { slug }); navigate('/dashboard') }}>
              Track {isGeneral ? 'all my assets' : calc.symbol} live — free
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          </div>
        </section>

        <section className="tc-section">
          <h2>How to use this calculator</h2>
          <ol className="tc-steps">
            <li>Enter the <strong>quantity</strong> — how many {unitWord} you hold or plan to buy.</li>
            <li>Enter your <strong>buy price</strong> — your average cost per {isStock ? 'share' : isMetal ? 'ounce' : 'unit'} in USD.</li>
            <li>Enter a <strong>target or sell price</strong> — what price do you expect or plan to sell at?</li>
            <li>Your <strong>P&amp;L, ROI, and break-even</strong> appear instantly below the inputs.</li>
          </ol>
        </section>

        <section className="tc-section">
          <h2>Track {assetLabel} live — beyond the calculator</h2>
          <p>
            This calculator is great for quick estimates. But if you want your {assetLabel}{' '}
            P&amp;L updating in <strong>real time with live prices</strong>, WalletLens does that
            automatically — for free, no account required.
          </p>
          <ul className="tc-list">
            <li><strong>Live price feed</strong> — your profit and loss update automatically, no manual input.</li>
            <li><strong>Multiple buy entries</strong> — log every purchase and the app blends your average cost basis.</li>
            <li><strong>All assets together</strong> — see {isGeneral ? 'crypto, stocks, and metals' : calc.name} alongside every other asset you own in a single net-worth view.</li>
            <li><strong>No account or sign-up</strong> — open the dashboard and start tracking in under a minute.</li>
            <li><strong>Private by design</strong> — your holdings never leave your device.</li>
          </ul>
          <button className="lp-cta-primary" style={{ marginTop: '0.9rem' }}
            onClick={() => { track('calculator_cta_bottom', { slug }); navigate('/dashboard') }}>
            Open free portfolio tracker
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </section>

        <section className="tc-section">
          <h2>Frequently asked questions</h2>
          <h3>How do I calculate {isGeneral ? 'investment' : calc.name} profit?</h3>
          <p>
            Profit = (Sell Price − Buy Price) × Quantity. ROI % = (Profit ÷ Amount Invested) × 100.
            The calculator above handles this automatically — just enter your three numbers.
          </p>
          <h3>What is a break-even price?</h3>
          <p>
            Your break-even price is the price at which you recover exactly what you invested — no profit, no loss.
            For a simple position without fees it equals your buy price. With fees, the break-even is slightly higher.
          </p>
          {!isGeneral && (
            <><h3>Can I track {calc.name} live instead of using this calculator?</h3>
            <p>
              Yes — WalletLens updates your {calc.name} P&amp;L in real time using live market prices.
              Add your position once and it tracks your gain or loss automatically alongside your entire net worth.
            </p></>
          )}
        </section>

        <footer className="tc-foot">
          <Link to="/free-net-worth-tracker/">Free net worth tracker</Link>
          <span>·</span>
          <Link to="/blog/">Blog</Link>
          <span>·</span>
          <Link to="/about/">About</Link>
          <span>·</span>
          <Link to="/">Home</Link>
        </footer>
      </main>
    </div>
  )
}
