import { useState } from 'react'
import { loadData, saveData, bumpId } from '../data/storage'

const COINGECKO_IDS = {
  ETH: 'ethereum', BTC: 'bitcoin', SOL: 'solana',
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', BUSD: 'binance-usd',
  WBTC: 'wrapped-bitcoin', WETH: 'weth', UNI: 'uniswap', LINK: 'chainlink',
  AAVE: 'aave', MKR: 'maker', COMP: 'compound-governance-token', CRV: 'curve-dao-token',
  SNX: 'havven', YFI: 'yearn-finance', SUSHI: 'sushi', '1INCH': '1inch',
  LDO: 'lido-dao', ARB: 'arbitrum', OP: 'optimism', MATIC: 'matic-network',
  SHIB: 'shiba-inu', PEPE: 'pepe', DOGE: 'dogecoin',
  APE: 'apecoin', SAND: 'the-sandbox', MANA: 'decentraland',
  GRT: 'the-graph', ENS: 'ethereum-name-service', RPL: 'rocket-pool',
  FXS: 'frax-share', FRAX: 'frax', LUSD: 'liquity-usd',
  RAY: 'raydium', SRM: 'serum', MNGO: 'mango-markets',
  STEP: 'step-finance', ORCA: 'orca', JUP: 'jupiter-exchange-solana',
  WIF: 'dogwifcoin', BONK: 'bonk', PYTH: 'pyth-network',
}

function detectChain(addr) {
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'ethereum'
  if (/^(1|3)[a-zA-Z0-9]{25,34}$/.test(addr) || /^bc1[a-zA-HJ-NP-Z0-9]{6,87}$/.test(addr)) return 'bitcoin'
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return 'solana'
  return null
}

async function fetchPrices(ids) {
  if (!ids.length) return {}
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`)
    return await r.json()
  } catch { return {} }
}

async function fetchEthereum(address) {
  const [balRes, tokRes] = await Promise.all([
    fetch(`https://eth.blockscout.com/api/v2/addresses/${address}`),
    fetch(`https://eth.blockscout.com/api/v2/addresses/${address}/token-balances`),
  ])
  const balData = await balRes.json()
  const tokData = await tokRes.json()

  const ethBalance = parseFloat(balData.coin_balance || '0') / 1e18
  const tokens = Array.isArray(tokData) ? tokData : []

  const items = []
  if (ethBalance > 0) {
    items.push({ symbol: 'ETH', name: 'Ethereum', amount: ethBalance, geckoId: 'ethereum' })
  }

  const filtered = tokens
    .filter(t => t.token?.name && t.token?.symbol && parseFloat(t.value || '0') > 0)
    .map(t => {
      const decimals = parseInt(t.token.decimals || '18', 10)
      const amount = parseFloat(t.value) / Math.pow(10, decimals)
      const sym = (t.token.symbol || '').toUpperCase()
      return { symbol: sym, name: t.token.name, amount, geckoId: COINGECKO_IDS[sym] || null }
    })
    .filter(t => t.amount > 0)

  items.push(...filtered)

  const geckoIds = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
  const prices = await fetchPrices(geckoIds)

  const withValues = items.map(i => ({
    ...i,
    usdValue: i.geckoId && prices[i.geckoId]?.usd ? i.amount * prices[i.geckoId].usd : null,
    pricePerUnit: i.geckoId && prices[i.geckoId]?.usd ? prices[i.geckoId].usd : null,
  }))

  withValues.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
  return withValues.slice(0, 20)
}

async function fetchBitcoin(address) {
  const r = await fetch(`https://mempool.space/api/address/${address}`)
  const data = await r.json()
  const satoshis = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0)
  const btcBalance = satoshis / 1e8

  if (btcBalance <= 0) return []

  const prices = await fetchPrices(['bitcoin'])
  const usdPrice = prices.bitcoin?.usd || null

  return [{
    symbol: 'BTC',
    name: 'Bitcoin',
    amount: btcBalance,
    geckoId: 'bitcoin',
    usdValue: usdPrice ? btcBalance * usdPrice : null,
    pricePerUnit: usdPrice,
  }]
}

async function fetchSolana(address) {
  const rpc = 'https://api.mainnet-beta.solana.com'

  const [balRes, splRes] = await Promise.all([
    fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
    }),
    fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2, method: 'getTokenAccountsByOwner',
        params: [address, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }],
      }),
    }),
  ])

  const balData = await balRes.json()
  const splData = await splRes.json()

  const solBalance = (balData.result?.value || 0) / 1e9
  const items = []

  if (solBalance > 0) {
    items.push({ symbol: 'SOL', name: 'Solana', amount: solBalance, geckoId: 'solana' })
  }

  const accounts = splData.result?.value || []
  for (const acc of accounts) {
    const info = acc.account?.data?.parsed?.info
    if (!info) continue
    const amount = parseFloat(info.tokenAmount?.uiAmountString || '0')
    if (amount <= 0) continue
    const sym = (info.mint || '').slice(0, 6).toUpperCase()
    items.push({ symbol: sym, name: sym, amount, geckoId: COINGECKO_IDS[sym] || null })
  }

  const geckoIds = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
  const prices = await fetchPrices(geckoIds)

  const withValues = items.map(i => ({
    ...i,
    usdValue: i.geckoId && prices[i.geckoId]?.usd ? i.amount * prices[i.geckoId].usd : null,
    pricePerUnit: i.geckoId && prices[i.geckoId]?.usd ? prices[i.geckoId].usd : null,
  }))

  withValues.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
  return withValues.slice(0, 20)
}

function fmtAmount(n) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}

function fmtUsd(n) {
  if (n === null || n === undefined) return 'N/A'
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const CHAIN_LABELS = { ethereum: 'ETH', bitcoin: 'BTC', solana: 'SOL' }
const CHAIN_COLORS = { ethereum: '#627eea', bitcoin: '#f7931a', solana: '#9945ff' }

export default function WalletImport() {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [chain, setChain] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tokens, setTokens] = useState(null)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(false)

  function handleAddressChange(val) {
    setAddress(val)
    setTokens(null)
    setError('')
    setImported(false)
    const trimmed = val.trim()
    setChain(trimmed ? detectChain(trimmed) : null)
  }

  async function handleFetch() {
    const trimmed = address.trim()
    if (!trimmed) { setError('Enter a wallet address.'); return }
    const detectedChain = detectChain(trimmed)
    if (!detectedChain) { setError('Address not recognized. Supports ETH (0x…), BTC (1/3/bc1…), and Solana.'); return }

    setLoading(true)
    setError('')
    setTokens(null)
    setImported(false)
    try {
      let result
      if (detectedChain === 'ethereum') result = await fetchEthereum(trimmed)
      else if (detectedChain === 'bitcoin') result = await fetchBitcoin(trimmed)
      else result = await fetchSolana(trimmed)

      if (!result.length) {
        setError('No token balances found for this address.')
      } else {
        setTokens(result)
      }
    } catch (e) {
      setError('Network error fetching balances. Please try again.')
    }
    setLoading(false)
  }

  function handleImport() {
    if (!tokens?.length) return
    const wallets = loadData('wallets')
    const walletId = wallets[0]?.id || 1
    const txs = loadData('transactions')
    const today = new Date().toISOString().split('T')[0]

    for (const tok of tokens) {
      const coinId = tok.geckoId || `other:${tok.symbol.toLowerCase()}`
      const tx = {
        id: bumpId('crypto_tracker_next_tx_id'),
        wallet_id: parseInt(walletId),
        type: 'buy',
        category: 'crypto',
        coin_id: coinId,
        coin_symbol: tok.symbol,
        coin_name: tok.name,
        coin_image: '',
        amount: tok.amount,
        price_per_unit: tok.pricePerUnit || 0,
        total_cost: tok.usdValue || 0,
        exchange: 'On-Chain Import',
        notes: `Imported from ${address.slice(0, 8)}…`,
        date: today,
        created_at: new Date().toISOString(),
      }
      txs.unshift(tx)
    }

    saveData('transactions', txs)
    setImported(true)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '10px',
          color: '#818cf8',
          padding: '0.45rem 0.9rem',
          fontWeight: 700,
          fontSize: '0.82rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          width: '100%',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>📡</span> Import from Wallet
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '1rem',
          marginTop: '0.5rem',
          backdropFilter: 'blur(12px)',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={address}
                onChange={e => handleAddressChange(e.target.value)}
                placeholder="Paste ETH, BTC or Solana address…"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              {chain && (
                <span style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: CHAIN_COLORS[chain],
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '0.1rem 0.4rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  pointerEvents: 'none',
                }}>
                  {CHAIN_LABELS[chain]}
                </span>
              )}
            </div>
            <button
              onClick={handleFetch}
              disabled={loading}
              style={{
                background: 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: '8px',
                color: '#818cf8',
                padding: '0.5rem 0.85rem',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Fetching…' : 'Detect & Import'}
            </button>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              color: '#f87171',
              padding: '0.5rem 0.75rem',
              fontSize: '0.82rem',
              marginBottom: '0.75rem',
            }}>
              {error}
            </div>
          )}

          {tokens && (
            <>
              <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Token', 'Balance', 'Est. Value'].map(h => (
                        <th key={h} style={{ textAlign: h === 'Balance' || h === 'Est. Value' ? 'right' : 'left', padding: '0.35rem 0.5rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((tok, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                        <td style={{ padding: '0.35rem 0.5rem', color: '#e2e8f0' }}>
                          <strong>{tok.symbol}</strong>
                          {tok.name !== tok.symbol && <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '0.4rem', fontSize: '0.75rem' }}>{tok.name}</span>}
                        </td>
                        <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontFamily: 'monospace' }}>{fmtAmount(tok.amount)}</td>
                        <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: tok.usdValue ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{fmtUsd(tok.usdValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {imported ? (
                <div style={{
                  background: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  borderRadius: '8px',
                  color: '#4ade80',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.82rem',
                  textAlign: 'center',
                  fontWeight: 600,
                }}>
                  {tokens.length} holding{tokens.length !== 1 ? 's' : ''} imported successfully
                </div>
              ) : (
                <button
                  onClick={handleImport}
                  style={{
                    width: '100%',
                    background: 'rgba(74,222,128,0.15)',
                    border: '1px solid rgba(74,222,128,0.35)',
                    borderRadius: '8px',
                    color: '#4ade80',
                    padding: '0.55rem',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Import {tokens.length} Holding{tokens.length !== 1 ? 's' : ''} as Transactions
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
