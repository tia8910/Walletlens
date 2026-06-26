import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { track } from '../analytics'

const ARROW = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
)

function fmtUSD(n) {
  const abs = Math.abs(n)
  return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const STARTER_ROWS = [
  { id: 1, name: 'Bitcoin',  value: '5000', target: '40' },
  { id: 2, name: 'Ethereum', value: '3000', target: '30' },
  { id: 3, name: 'Stocks',   value: '4000', target: '20' },
  { id: 4, name: 'Cash',     value: '1000', target: '10' },
]

function RebalanceWidget() {
  const [rows, setRows] = useState(STARTER_ROWS)
  const [nextId, setNextId] = useState(5)
  const [contribution, setContribution] = useState('')

  const addRow = () => {
    setRows(r => [...r, { id: nextId, name: '', value: '', target: '' }])
    setNextId(i => i + 1)
    track('rebalance_add_row')
  }
  const removeRow = (id) => setRows(r => r.filter(x => x.id !== id))
  const updateRow = (id, key, val) => setRows(r => r.map(x => x.id === id ? { ...x, [key]: val } : x))

  const calc = useMemo(() => {
    const parsed = rows.map(r => ({
      ...r,
      v: parseFloat(r.value) || 0,
      t: parseFloat(r.target) || 0,
    }))
    const currentTotal = parsed.reduce((s, r) => s + r.v, 0)
    const extra = parseFloat(contribution) || 0
    const newTotal = currentTotal + extra
    const targetSum = parsed.reduce((s, r) => s + r.t, 0)
    const results = parsed.map(r => {
      const currentPct = currentTotal > 0 ? (r.v / currentTotal) * 100 : 0
      const targetValue = (r.t / 100) * newTotal
      const action = targetValue - r.v // + = buy, - = sell
      return { ...r, currentPct, targetValue, action }
    })
    return { currentTotal, newTotal, extra, targetSum, results }
  }, [rows, contribution])

  const targetsValid = Math.abs(calc.targetSum - 100) < 0.5
  const hasData = calc.currentTotal > 0

  return (
    <div className="rb-widget">
      <div className="rb-table">
        <div className="rb-row rb-row-head">
          <span className="rb-c-name">Asset</span>
          <span className="rb-c-num">Current value ($)</span>
          <span className="rb-c-num">Target %</span>
          <span className="rb-c-action">Action</span>
          <span className="rb-c-del" aria-hidden="true" />
        </div>
        {calc.results.map(r => {
          const buy = r.action >= 0
          return (
            <div className="rb-row" key={r.id}>
              <input
                className="rb-input rb-c-name"
                placeholder="e.g. Bitcoin"
                value={r.name}
                onChange={e => updateRow(r.id, 'name', e.target.value)}
              />
              <input
                className="rb-input rb-c-num"
                type="number" min="0" step="any" placeholder="0"
                value={r.value}
                onChange={e => updateRow(r.id, 'value', e.target.value)}
              />
              <input
                className="rb-input rb-c-num"
                type="number" min="0" max="100" step="any" placeholder="0"
                value={r.target}
                onChange={e => updateRow(r.id, 'target', e.target.value)}
              />
              <span className={`rb-c-action ${hasData ? (Math.abs(r.action) < 0.005 ? 'rb-hold' : buy ? 'rb-buy' : 'rb-sell') : ''}`}>
                {hasData
                  ? (Math.abs(r.action) < 0.005
                      ? '✓ On target'
                      : `${buy ? 'Buy' : 'Sell'} $${fmtUSD(r.action)}`)
                  : '—'}
              </span>
              <button className="rb-del" onClick={() => removeRow(r.id)} aria-label="Remove asset" title="Remove">✕</button>
            </div>
          )
        })}
      </div>

      <div className="rb-controls">
        <button className="rb-add" onClick={addRow}>+ Add asset</button>
        <label className="rb-contrib">
          <span>New cash to invest (optional)</span>
          <input
            type="number" min="0" step="any" placeholder="0.00"
            value={contribution}
            onChange={e => setContribution(e.target.value)}
          />
        </label>
      </div>

      <div className="rb-summary">
        <div className="rb-sum-row">
          <span>Current portfolio total</span>
          <strong>${fmtUSD(calc.currentTotal)}</strong>
        </div>
        {calc.extra > 0 && (
          <div className="rb-sum-row">
            <span>After new contribution</span>
            <strong>${fmtUSD(calc.newTotal)}</strong>
          </div>
        )}
        <div className={`rb-sum-row ${targetsValid ? 'rb-ok' : 'rb-warn'}`}>
          <span>Target allocation total</span>
          <strong>{calc.targetSum.toFixed(1)}%{targetsValid ? ' ✓' : ' — should equal 100%'}</strong>
        </div>
      </div>

      {!hasData && <p className="rb-hint">Enter your holdings above to see exactly what to buy and sell.</p>}
    </div>
  )
}

export default function Rebalancing() {
  const navigate = useNavigate()

  useEffect(() => {
    track('rebalancing_tool_view')
    document.title = 'Portfolio Rebalancing Calculator — Free & Instant | WalletLens'
  }, [])

  return (
    <div className="wl-app wl-app-landing">
      <main className="tc-page">
        <header className="tc-head">
          <Link to="/" className="tc-brand" aria-label="WalletLens home">
            <Logo size={34} /> <span>WalletLens</span>
          </Link>
        </header>

        <section className="tc-hero">
          <h1 className="tc-h1">Portfolio Rebalancing Calculator — Free &amp; Instant</h1>
          <p className="tc-sub">
            Enter your holdings and target allocation. This calculator shows exactly how much
            of each asset to <strong>buy or sell</strong> to get back to your plan — crypto,
            stocks, metals and cash in one place. No account, no sign-up.
          </p>
          <RebalanceWidget />
          <div className="tc-cta-row" style={{ marginTop: '1.4rem' }}>
            <button className="lp-cta-primary"
              onClick={() => { track('rebalancing_cta', { spot: 'hero' }); navigate('/dashboard') }}>
              Track my allocation live — free
              {ARROW}
            </button>
          </div>
        </section>

        <section className="tc-section">
          <h2>How to rebalance your portfolio</h2>
          <ol className="tc-steps">
            <li>List each <strong>asset</strong> you hold — Bitcoin, Ethereum, stocks, gold, cash, anything.</li>
            <li>Enter its <strong>current value</strong> in dollars.</li>
            <li>Set your <strong>target allocation %</strong> for each asset (these should add up to 100%).</li>
            <li>Optionally add <strong>new cash</strong> you plan to invest — the calculator rebalances using it first, which avoids selling and reduces taxes.</li>
            <li>Read the <strong>Action column</strong>: it tells you the exact dollar amount to buy or sell for each asset.</li>
          </ol>
        </section>

        <section className="tc-section">
          <h2>What is portfolio rebalancing?</h2>
          <p>
            <strong>Rebalancing</strong> is the discipline of periodically restoring your portfolio
            to its target allocation. Over time, winning assets grow to take up a larger share than
            you intended — which quietly raises your risk. Rebalancing trims those overweight winners
            and tops up the underweight positions, enforcing a built-in <strong>buy-low, sell-high</strong> habit
            and keeping your risk level consistent with your plan.
          </p>
          <p>
            Most investors rebalance on a <strong>schedule</strong> (quarterly or annually) or when an
            allocation <strong>drifts past a threshold</strong> such as 5%. If you are adding money regularly,
            you can often rebalance with new contributions alone — buying only the underweight assets —
            so you never have to sell and trigger capital-gains tax.
          </p>
        </section>

        <section className="tc-section">
          <h2>Track your allocation live — beyond the calculator</h2>
          <p>
            This calculator is perfect for a one-off rebalance. But your allocation drifts every day as
            prices move. <strong>WalletLens</strong> shows your live allocation across crypto, stocks, metals
            and cash automatically — so you can see at a glance the moment a position drifts and decide
            whether to rebalance. It is 100% free, needs no account, and your data stays on your device.
          </p>
          <ul className="tc-list">
            <li><strong>Live allocation pie</strong> — your real percentages update automatically with market prices.</li>
            <li><strong>Drift alerts</strong> — see when any asset moves beyond your target band.</li>
            <li><strong>Every asset together</strong> — crypto, stocks, gold and cash in one net-worth view.</li>
            <li><strong>Private by design</strong> — no account, no bank login, nothing leaves your device.</li>
          </ul>
          <button className="lp-cta-primary" style={{ marginTop: '0.9rem' }}
            onClick={() => { track('rebalancing_cta', { spot: 'bottom' }); navigate('/dashboard') }}>
            Open free portfolio tracker
            {ARROW}
          </button>
        </section>

        <section className="tc-section">
          <h2>Frequently asked questions</h2>
          <h3>How do I calculate how much to rebalance?</h3>
          <p>
            For each asset, multiply your target percentage by your total portfolio value to get its
            target dollar value. Subtract its current value: a positive number means buy that amount,
            a negative number means sell it. The calculator above does this for every asset instantly.
          </p>
          <h3>How often should I rebalance my portfolio?</h3>
          <p>
            Common approaches are rebalancing on a fixed schedule — quarterly or annually — or whenever
            an allocation drifts beyond a set threshold like 5%. Rebalancing too often raises trading costs
            and taxes; too rarely lets risk build up. A threshold-based check every quarter is a popular middle ground.
          </p>
          <h3>How do I rebalance a crypto portfolio without selling?</h3>
          <p>
            Use new contributions. Instead of selling overweight coins, direct fresh cash only into the
            underweight assets until your allocation is back on target. This avoids triggering capital-gains
            tax. Enter your planned cash in the "New cash to invest" field above to see how far it gets you.
          </p>
          <h3>Does rebalancing improve returns?</h3>
          <p>
            Rebalancing is primarily about controlling risk, not maximising returns. It keeps your portfolio
            aligned with your plan and enforces a buy-low, sell-high discipline. In a long one-way bull market
            it can lag a portfolio left untouched, but it meaningfully reduces drawdowns when trends reverse.
          </p>
        </section>

        <section className="tc-section">
          <h2>Related</h2>
          <ul className="tc-list">
            <li><Link to="/learn/portfolio-rebalancing/">What is portfolio rebalancing?</Link></li>
            <li><Link to="/learn/asset-allocation/">What is asset allocation?</Link></li>
            <li><Link to="/learn/diversification/">What is diversification?</Link></li>
            <li><Link to="/blog/how-to-rebalance-crypto-stock-portfolio/">How to rebalance a crypto &amp; stock portfolio</Link></li>
          </ul>
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
