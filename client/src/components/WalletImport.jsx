import { useState } from 'react'
import { loadData, saveData, bumpId } from '../data/storage'

// ── CoinGecko IDs for common tokens ────────────────────────────────────────
const GECKO = {
  ETH:'ethereum', BTC:'bitcoin', SOL:'solana', BNB:'binancecoin',
  MATIC:'matic-network', POL:'matic-network', AVAX:'avalanche-2',
  TRX:'tron', ARB:'arbitrum', OP:'optimism',
  USDT:'tether', USDC:'usd-coin', DAI:'dai', BUSD:'binance-usd', TUSD:'true-usd',
  WBTC:'wrapped-bitcoin', WETH:'weth', WBNB:'wbnb',
  UNI:'uniswap', LINK:'chainlink', AAVE:'aave', MKR:'maker',
  COMP:'compound-governance-token', CRV:'curve-dao-token',
  SNX:'havven', YFI:'yearn-finance', SUSHI:'sushi', '1INCH':'1inch',
  LDO:'lido-dao', GRT:'the-graph', ENS:'ethereum-name-service',
  RPL:'rocket-pool', FXS:'frax-share', FRAX:'frax',
  SHIB:'shiba-inu', PEPE:'pepe', DOGE:'dogecoin', APE:'apecoin',
  RAY:'raydium', JUP:'jupiter-exchange-solana',
  WIF:'dogwifcoin', BONK:'bonk', PYTH:'pyth-network',
  CAKE:'pancakeswap-token', XVS:'venus',
  QUICK:'quick', GHST:'aavegotchi',
  RNDR:'render-token', JTO:'jito-governance',
}

// ── Chain definitions ────────────────────────────────────────────────────────
const EVM_CHAINS = [
  { id:'ethereum',  label:'ETH',  color:'#627eea', native:'ETH',  nativeId:'ethereum',    blockscout:'https://eth.blockscout.com',      ankrChain:'eth' },
  { id:'bsc',       label:'BSC',  color:'#f0b90b', native:'BNB',  nativeId:'binancecoin', blockscout:'https://bsc.blockscout.com',      ankrChain:'bsc' },
  { id:'polygon',   label:'POL',  color:'#8247e5', native:'POL',  nativeId:'matic-network',blockscout:'https://polygon.blockscout.com', ankrChain:'polygon' },
  { id:'arbitrum',  label:'ARB',  color:'#28a0f0', native:'ETH',  nativeId:'ethereum',    blockscout:'https://arbitrum.blockscout.com', ankrChain:'arbitrum' },
  { id:'optimism',  label:'OP',   color:'#ff0420', native:'ETH',  nativeId:'ethereum',    blockscout:'https://optimism.blockscout.com', ankrChain:'optimism' },
  { id:'base',      label:'BASE', color:'#0052ff', native:'ETH',  nativeId:'ethereum',    blockscout:'https://base.blockscout.com',     ankrChain:'base' },
  { id:'avalanche', label:'AVAX', color:'#e84142', native:'AVAX', nativeId:'avalanche-2', blockscout:'https://avalanche.blockscout.com',ankrChain:'avalanche' },
]

// ── Address detection ────────────────────────────────────────────────────────
function detectType(addr) {
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return 'evm'
  if (/^(1|3)[a-zA-Z0-9]{25,34}$/.test(addr) || /^bc1[a-zA-HJ-NP-Z0-9]{6,87}$/.test(addr)) return 'bitcoin'
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return 'tron'
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return 'solana'
  return null
}

// ── Fetch with timeout ───────────────────────────────────────────────────────
function timedFetch(url, ms = 12000, opts = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id))
}

// ── Price fetch ──────────────────────────────────────────────────────────────
async function fetchPrices(ids) {
  if (!ids.length) return {}
  try {
    const r = await timedFetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`)
    if (!r.ok) return {}
    return await r.json()
  } catch { return {} }
}

function enrichWithPrices(items, prices) {
  return items
    .map(i => ({
      ...i,
      usdValue: i.geckoId && prices[i.geckoId]?.usd ? i.amount * prices[i.geckoId].usd : (i.usdValue ?? null),
      pricePerUnit: i.geckoId && prices[i.geckoId]?.usd ? prices[i.geckoId].usd : (i.pricePerUnit ?? null),
    }))
    .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
    .slice(0, 25)
}

// ── ETH fetch — Ethplorer (primary) + Blockscout fallback ───────────────────
async function fetchEthereum(address) {
  try {
    const r = await timedFetch(`https://api.ethplorer.io/getAddressInfo/${address}?apiKey=freekey`)
    if (r.ok) {
      const data = await r.json()
      if (data.error) throw new Error(data.error.message)
      const items = []
      const ethBal = data.ETH?.balance || 0
      if (ethBal > 0.000001) items.push({ symbol:'ETH', name:'Ethereum', amount: ethBal, geckoId:'ethereum' })
      for (const tok of data.tokens || []) {
        const sym = (tok.tokenInfo?.symbol || '').toUpperCase()
        const dec = parseInt(tok.tokenInfo?.decimals || '18', 10)
        const amount = parseFloat(tok.rawBalance || '0') / Math.pow(10, dec)
        if (amount <= 0.000001) continue
        items.push({ symbol: sym, name: tok.tokenInfo?.name || sym, amount, geckoId: GECKO[sym] || null })
      }
      const ids = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
      return enrichWithPrices(items, await fetchPrices(ids))
    }
  } catch { /* fall through */ }
  return fetchBlockscout(address, 'https://eth.blockscout.com', 'ETH', 'ethereum')
}

// ── Ankr multi-chain API — primary for non-ETH EVM chains ──────────────────
// Free anonymous tier, no API key required, returns native + ERC-20 with USD prices
async function fetchAnkrEvm(address, ankrChain) {
  const r = await timedFetch('https://rpc.ankr.com/multichain', 15000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'ankr_getAccountBalance',
      params: { walletAddress: address, blockchain: [ankrChain], onlyWhitelisted: false }
    }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  if (data.error) throw new Error(data.error.message)
  const items = []
  for (const asset of data.result?.assets || []) {
    const amount = parseFloat(asset.balance || '0')
    if (amount <= 0.000001) continue
    const sym = (asset.tokenSymbol || '').toUpperCase()
    const usdValue = parseFloat(asset.balanceUsd || '0') || null
    items.push({
      symbol: sym,
      name: asset.tokenName || sym,
      amount,
      geckoId: GECKO[sym] || null,
      usdValue,
      pricePerUnit: usdValue && amount ? usdValue / amount : null,
    })
  }
  if (!items.length) throw new Error('No assets returned')
  return items.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0)).slice(0, 25)
}

// ── Blockscout v2 — fallback for EVM chains ─────────────────────────────────
async function fetchBlockscout(address, base, nativeSym, nativeGeckoId) {
  const [balRes, tokRes] = await Promise.all([
    timedFetch(`${base}/api/v2/addresses/${address}`),
    timedFetch(`${base}/api/v2/addresses/${address}/token-balances`),
  ])
  if (!balRes.ok) throw new Error(`HTTP ${balRes.status}`)
  const balData = await balRes.json()
  const tokData = tokRes.ok ? await tokRes.json() : []

  const items = []
  const native = parseFloat(balData.coin_balance || '0') / 1e18
  if (native > 0.000001) {
    items.push({ symbol: nativeSym, name: nativeSym, amount: native, geckoId: nativeGeckoId })
  }

  const tokens = Array.isArray(tokData) ? tokData : []
  for (const t of tokens) {
    if (!t.token?.symbol || parseFloat(t.value || '0') <= 0) continue
    const dec = parseInt(t.token.decimals || '18', 10)
    const amount = parseFloat(t.value) / Math.pow(10, dec)
    if (amount <= 0) continue
    const sym = (t.token.symbol || '').toUpperCase()
    items.push({ symbol: sym, name: t.token.name || sym, amount, geckoId: GECKO[sym] || null })
  }

  const ids = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
  return enrichWithPrices(items, await fetchPrices(ids))
}

// ── Bitcoin — mempool.space primary, blockstream.info fallback ───────────────
async function fetchBitcoin(address) {
  const endpoints = [
    `https://mempool.space/api/address/${address}`,
    `https://blockstream.info/api/address/${address}`,
  ]
  let lastErr
  for (const url of endpoints) {
    try {
      const r = await timedFetch(url, 10000)
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue }
      const data = await r.json()
      const sats = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0)
      const btc = sats / 1e8
      if (btc <= 0.000001) return []
      const prices = await fetchPrices(['bitcoin'])
      return enrichWithPrices([{ symbol:'BTC', name:'Bitcoin', amount:btc, geckoId:'bitcoin' }], prices)
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('All Bitcoin APIs failed')
}

// ── Solana — multiple free RPC fallbacks ─────────────────────────────────────
const SOL_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana.public-rpc.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
]

async function rpcPost(rpc, body) {
  const r = await timedFetch(rpc, 10000, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const SOL_TOKEN_SYMBOLS = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol:'USDC', geckoId:'usd-coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol:'USDT', geckoId:'tether' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol:'BONK', geckoId:'bonk' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN':  { symbol:'JUP',  geckoId:'jupiter-exchange-solana' },
  'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof':  { symbol:'RNDR', geckoId:'render-token' },
  'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey': { symbol:'MNDE', geckoId:'marinade' },
  'jtojtomepa8bdhtbhzucxstb8xczraqvkjivbzdi7se':  { symbol:'JTO',  geckoId:'jito-governance' },
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol:'WIF', geckoId:'dogwifcoin' },
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': { symbol:'PYTH', geckoId:'pyth-network' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So':  { symbol:'mSOL', geckoId:'msol' },
  'So11111111111111111111111111111111111111112':    { symbol:'SOL',  geckoId:'solana' },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1':  { symbol:'bSOL', geckoId:'blazestake-staked-sol' },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol:'ETH',  geckoId:'ethereum' },
}

async function fetchSolana(address) {
  let lastErr
  for (const rpc of SOL_RPCS) {
    try {
      const [balData, splData] = await Promise.all([
        rpcPost(rpc, { jsonrpc:'2.0', id:1, method:'getBalance', params:[address] }),
        rpcPost(rpc, {
          jsonrpc:'2.0', id:2, method:'getTokenAccountsByOwner',
          params:[address, { programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding:'jsonParsed' }],
        }),
      ])
      if (balData.error) throw new Error(balData.error.message)

      const solBalance = (balData.result?.value || 0) / 1e9
      const items = []
      if (solBalance > 0.000001) {
        items.push({ symbol:'SOL', name:'Solana', amount:solBalance, geckoId:'solana' })
      }

      for (const acc of splData.result?.value || []) {
        const info = acc.account?.data?.parsed?.info
        if (!info) continue
        const amount = parseFloat(info.tokenAmount?.uiAmountString || '0')
        if (amount <= 0) continue
        const mint = info.mint || ''
        const known = SOL_TOKEN_SYMBOLS[mint]
        const sym = known?.symbol || mint.slice(0, 6).toUpperCase()
        items.push({ symbol: sym, name: sym, amount, geckoId: known?.geckoId || GECKO[sym] || null })
      }

      const ids = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
      return enrichWithPrices(items, await fetchPrices(ids))
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('All Solana RPCs failed')
}

// ── Tron — TronScan primary, TronGrid fallback ───────────────────────────────
async function fetchTron(address) {
  // Primary: TronScan API
  try {
    const [accRes, tokRes] = await Promise.all([
      timedFetch(`https://apilist.tronscanapi.com/api/account?address=${address}`),
      timedFetch(`https://apilist.tronscanapi.com/api/account/tokens?address=${address}&start=0&limit=50`),
    ])
    if (accRes.ok) {
      const accData = await accRes.json()
      const tokData = tokRes.ok ? await tokRes.json() : { data: [] }
      const items = []
      const trxBalance = (accData.balance || 0) / 1e6
      if (trxBalance > 0.01) items.push({ symbol:'TRX', name:'Tron', amount:trxBalance, geckoId:'tron' })
      for (const tok of tokData.data || []) {
        if (!tok.tokenAbbr || tok.quantity <= 0) continue
        const sym = (tok.tokenAbbr || '').toUpperCase()
        const dec = tok.tokenDecimal || 6
        const amount = parseFloat(tok.quantity) / Math.pow(10, dec)
        if (amount <= 0.000001) continue
        items.push({ symbol: sym, name: tok.tokenName || sym, amount, geckoId: GECKO[sym] || null })
      }
      const ids = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
      return enrichWithPrices(items, await fetchPrices(ids))
    }
  } catch { /* fall through to TronGrid */ }

  // Fallback: TronGrid official API
  const r = await timedFetch(`https://api.trongrid.io/v1/accounts/${address}`, 12000)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  const acc = data.data?.[0]
  if (!acc) return []
  const items = []
  const trxBalance = (acc.balance || 0) / 1e6
  if (trxBalance > 0.01) items.push({ symbol:'TRX', name:'Tron', amount:trxBalance, geckoId:'tron' })
  for (const tok of acc.trc20 || []) {
    const [contractAddr, rawAmt] = Object.entries(tok)[0] || []
    if (!contractAddr || !rawAmt) continue
    const amount = parseFloat(rawAmt) / 1e6
    if (amount <= 0.000001) continue
    items.push({ symbol: contractAddr.slice(0, 4).toUpperCase(), name: '', amount, geckoId: null })
  }
  const ids = [...new Set(items.map(i => i.geckoId).filter(Boolean))]
  return enrichWithPrices(items, await fetchPrices(ids))
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtAmount(n) {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 })
}
function fmtUsd(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ────────────────────────────────────────────────────────────────
export default function WalletImport() {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [addrType, setAddrType] = useState(null)
  const [evmChain, setEvmChain] = useState(EVM_CHAINS[0])
  const [loading, setLoading] = useState(false)
  const [tokens, setTokens] = useState(null)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(false)

  function handleAddressChange(val) {
    setAddress(val)
    setTokens(null)
    setError('')
    setImported(false)
    setAddrType(val.trim() ? detectType(val.trim()) : null)
  }

  async function handleFetch() {
    const trimmed = address.trim()
    if (!trimmed) { setError('Enter a wallet address.'); return }
    const type = detectType(trimmed)
    if (!type) {
      setError('Address not recognized. Supports ETH/EVM (0x…), BTC, Solana, and Tron (T…).')
      return
    }
    setLoading(true); setError(''); setTokens(null); setImported(false)
    try {
      let result
      if (type === 'evm') {
        if (evmChain.id === 'ethereum') {
          result = await fetchEthereum(trimmed)
        } else {
          // Ankr multi-chain API is more reliable for non-ETH EVM chains
          try {
            result = await fetchAnkrEvm(trimmed, evmChain.ankrChain)
          } catch {
            result = await fetchBlockscout(trimmed, evmChain.blockscout, evmChain.native, evmChain.nativeId)
          }
        }
      } else if (type === 'bitcoin') {
        result = await fetchBitcoin(trimmed)
      } else if (type === 'solana') {
        result = await fetchSolana(trimmed)
      } else {
        result = await fetchTron(trimmed)
      }

      if (!result.length) setError('No token balances found for this address.')
      else setTokens(result)
    } catch (e) {
      const msg = e?.name === 'AbortError' ? 'Request timed out. Please try again.' : 'Network error fetching balances. Please try again.'
      setError(msg)
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
      txs.unshift({
        id: bumpId('crypto_tracker_next_tx_id'),
        wallet_id: parseInt(walletId),
        type: 'buy', category: 'crypto',
        coin_id: coinId, coin_symbol: tok.symbol, coin_name: tok.name, coin_image: '',
        amount: tok.amount,
        price_per_unit: tok.pricePerUnit || 0,
        total_cost: tok.usdValue || 0,
        exchange: 'On-Chain Import',
        notes: `Imported from ${address.slice(0, 8)}…`,
        date: today,
        created_at: new Date().toISOString(),
      })
    }
    saveData('transactions', txs)
    setImported(true)
  }

  const badge = addrType === 'bitcoin' ? { label:'BTC', color:'#f7931a' }
    : addrType === 'tron'    ? { label:'TRX', color:'#ff0013' }
    : addrType === 'solana'  ? { label:'SOL', color:'#9945ff' }
    : addrType === 'evm'     ? { label: evmChain.label, color: evmChain.color }
    : null

  return (
    <div style={{ marginBottom: '1rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '10px', color: '#818cf8',
          padding: '0.45rem 0.9rem', fontWeight: 700, fontSize: '0.82rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: '0.4rem', width: '100%', justifyContent: 'space-between',
        }}
      >
        <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          <span>📡</span> Import from Wallet
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '1rem', marginTop: '0.5rem',
          backdropFilter: 'blur(12px)',
        }}>
          {addrType === 'evm' && (
            <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap', marginBottom:'0.6rem' }}>
              {EVM_CHAINS.map(c => (
                <button key={c.id} onClick={() => setEvmChain(c)} style={{
                  padding:'0.2rem 0.55rem', borderRadius:'6px', fontSize:'0.72rem',
                  fontWeight:700, cursor:'pointer', border:'1.5px solid',
                  borderColor: evmChain.id === c.id ? c.color : 'rgba(255,255,255,0.12)',
                  background: evmChain.id === c.id ? `${c.color}22` : 'transparent',
                  color: evmChain.id === c.id ? c.color : 'var(--text-muted)',
                  transition:'all 0.15s',
                }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.75rem' }}>
            <div style={{ position:'relative', flex:1 }}>
              <input
                type="text"
                value={address}
                onChange={e => handleAddressChange(e.target.value)}
                placeholder="Paste ETH/BNB/POL/ARB/OP/BASE/AVAX, BTC, SOL or TRX address…"
                style={{
                  width:'100%',
                  background:'rgba(255,255,255,0.05)',
                  border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'#e2e8f0',
                  padding:'0.5rem 0.75rem', fontSize:'0.78rem',
                  fontFamily:'monospace', boxSizing:'border-box',
                  paddingRight: badge ? '4rem' : '0.75rem',
                }}
              />
              {badge && (
                <span style={{
                  position:'absolute', right:'0.5rem', top:'50%', transform:'translateY(-50%)',
                  background: badge.color, color:'#fff', borderRadius:'4px',
                  padding:'0.1rem 0.4rem', fontSize:'0.7rem', fontWeight:700, pointerEvents:'none',
                }}>
                  {badge.label}
                </span>
              )}
            </div>
            <button onClick={handleFetch} disabled={loading} style={{
              background:'rgba(99,102,241,0.2)', border:'1px solid rgba(99,102,241,0.4)',
              borderRadius:'8px', color:'#818cf8',
              padding:'0.5rem 0.85rem', fontWeight:700, fontSize:'0.82rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace:'nowrap', opacity: loading ? 0.6 : 1,
            }}>
              {loading ? 'Fetching…' : 'Detect & Import'}
            </button>
          </div>

          {!addrType && (
            <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:'0 0 0.5rem', lineHeight:1.4 }}>
              Supports: <strong style={{color:'#627eea'}}>ETH</strong> · <strong style={{color:'#f0b90b'}}>BSC</strong> · <strong style={{color:'#8247e5'}}>Polygon</strong> · <strong style={{color:'#28a0f0'}}>Arbitrum</strong> · <strong style={{color:'#ff0420'}}>Optimism</strong> · <strong style={{color:'#0052ff'}}>Base</strong> · <strong style={{color:'#e84142'}}>Avalanche</strong> · <strong style={{color:'#f7931a'}}>Bitcoin</strong> · <strong style={{color:'#9945ff'}}>Solana</strong> · <strong style={{color:'#ff0013'}}>Tron</strong>
            </p>
          )}

          {error && (
            <div style={{
              background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)',
              borderRadius:'8px', color:'#f87171',
              padding:'0.5rem 0.75rem', fontSize:'0.82rem', marginBottom:'0.75rem',
            }}>
              {error}
            </div>
          )}

          {tokens && (
            <>
              <div style={{ overflowX:'auto', marginBottom:'0.75rem' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['Token', 'Balance', 'Est. Value'].map(h => (
                        <th key={h} style={{
                          textAlign: h !== 'Token' ? 'right' : 'left',
                          padding:'0.35rem 0.5rem', color:'var(--text-sub)', fontWeight:600,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((tok, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface-1)' : 'transparent' }}>
                        <td style={{ padding:'0.35rem 0.5rem', color:'var(--text)' }}>
                          <strong>{tok.symbol}</strong>
                          {tok.name && tok.name !== tok.symbol && (
                            <span style={{ color:'var(--text-sub)', marginLeft:'0.4rem', fontSize:'0.75rem' }}>{tok.name}</span>
                          )}
                        </td>
                        <td style={{ padding:'0.35rem 0.5rem', textAlign:'right', color:'var(--text-muted)', fontFamily:'monospace' }}>
                          {fmtAmount(tok.amount)}
                        </td>
                        <td style={{ padding:'0.35rem 0.5rem', textAlign:'right', color: tok.usdValue ? '#4ade80' : 'var(--text-sub)' }}>
                          {fmtUsd(tok.usdValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {imported ? (
                <div style={{
                  background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.3)',
                  borderRadius:'8px', color:'#4ade80',
                  padding:'0.5rem 0.75rem', fontSize:'0.82rem', textAlign:'center', fontWeight:600,
                }}>
                  {tokens.length} holding{tokens.length !== 1 ? 's' : ''} imported successfully
                </div>
              ) : (
                <button onClick={handleImport} style={{
                  width:'100%',
                  background:'rgba(74,222,128,0.15)', border:'1px solid rgba(74,222,128,0.35)',
                  borderRadius:'8px', color:'#4ade80',
                  padding:'0.55rem', fontWeight:700, fontSize:'0.85rem', cursor:'pointer',
                }}>
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
