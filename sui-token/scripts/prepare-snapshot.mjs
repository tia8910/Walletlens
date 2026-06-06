#!/usr/bin/env node
// Anti-sybil snapshot prep: gate candidate wallets by on-chain Sui history, then
// assign a FLAT, capped allocation (so multi-wallet farming is uneconomic).
//
//   node scripts/prepare-snapshot.mjs <candidates.csv> --pool <LENZ> [options]
//
// candidates.csv : one Sui address per line (header + extra columns ignored).
// Options:
//   --pool <LENZ>     total LENZ to distribute in this batch (e.g. 6300000)   [required]
//   --rpc <url>       Sui full node      (default: https://fullnode.mainnet.sui.io:443)
//   --min-tx <n>      min prior outgoing txns to be eligible (default 1; 0 = no gate)
//   --cap <LENZ>      hard per-wallet cap (default 21000  = ~0.1% of supply)
//   --skip-gate       skip the on-chain check (offline; for testing allocation)
//   --out <file>      output snapshot (default snapshot.csv)
//
// Filters fresh / zero-history throwaway wallets, then splits the pool EQUALLY among
// the survivors (capped). Output snapshot.csv (address,amount-in-base-units) feeds
// build-merkle.mjs. Also writes rejected.csv. Node >= 18 (global fetch).
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const csvPath = args[0]
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const has = (k) => args.includes(k)
if (!csvPath || has('--help')) { console.error('usage: node scripts/prepare-snapshot.mjs <candidates.csv> --pool <LENZ> [--rpc URL] [--min-tx N] [--cap LENZ] [--skip-gate] [--out file]'); process.exit(1) }

const RPC = opt('--rpc', 'https://fullnode.mainnet.sui.io:443')
const MIN_TX = parseInt(opt('--min-tx', '1'), 10)
const CAP_BASE = BigInt(Math.round(parseFloat(opt('--cap', '21000')) * 1e6))
const OUT = opt('--out', 'snapshot.csv')
const poolArg = opt('--pool', null)
if (!poolArg) { console.error('--pool <LENZ> is required'); process.exit(1) }
const POOL_BASE = BigInt(Math.round(parseFloat(poolArg) * 1e6))
const ADDR_RE = /^0x[0-9a-fA-F]{64}$/

let addrs = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/)
  .map(l => l.split(',')[0].trim()).filter(Boolean)
  .filter(a => !/^address$/i.test(a))
addrs = [...new Set(addrs.map(a => a.toLowerCase()))]            // de-dupe
const bad = addrs.filter(a => !ADDR_RE.test(a))
if (bad.length) { console.error(`invalid addresses (${bad.length}), e.g. ${bad[0]}`); process.exit(1) }

async function outgoingTxCount(addr, want) {
  // True if the address has >= `want` outgoing transactions.
  const body = { jsonrpc: '2.0', id: 1, method: 'suix_queryTransactionBlocks',
    params: [{ filter: { FromAddress: addr }, options: {} }, null, Math.max(want, 1), false] }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      return (j?.result?.data?.length || 0) >= want
    } catch { await new Promise(s => setTimeout(s, 500 * (attempt + 1))) }
  }
  return false // on persistent RPC failure, treat as ineligible (fail safe)
}

let eligible = addrs
const rejected = []
if (!has('--skip-gate') && MIN_TX > 0) {
  eligible = []
  console.error(`Gating ${addrs.length} wallets (min ${MIN_TX} outgoing txns) via ${RPC} …`)
  for (let i = 0; i < addrs.length; i++) {
    const ok = await outgoingTxCount(addrs[i], MIN_TX)
    ;(ok ? eligible : rejected).push(addrs[i])
    if (i % 25 === 0) await new Promise(s => setTimeout(s, 60)) // be gentle on the RPC
    if (i % 100 === 0) console.error(`  …${i}/${addrs.length}`)
  }
}

if (eligible.length === 0) { console.error('no eligible wallets after gating'); process.exit(1) }

// Flat split, capped. (Equal allocation kills the multi-wallet incentive.)
let per = POOL_BASE / BigInt(eligible.length)
let capped = false
if (per > CAP_BASE) { per = CAP_BASE; capped = true }
if (per <= 0n) { console.error('pool too small for the number of eligible wallets'); process.exit(1) }

const lines = ['address,amount', ...eligible.map(a => `${a},${per}`)]
writeFileSync(OUT, lines.join('\n') + '\n')
if (rejected.length) writeFileSync('rejected.csv', ['address', ...rejected].join('\n') + '\n')

const used = per * BigInt(eligible.length)
console.error('— snapshot prepared —')
console.error(`eligible:   ${eligible.length}`)
console.error(`rejected:   ${rejected.length}${rejected.length ? ' (see rejected.csv)' : ''}`)
console.error(`per wallet: ${Number(per) / 1e6} LENZ${capped ? ' (hit per-wallet cap)' : ''}`)
console.error(`distributed:${Number(used) / 1e6} LENZ of ${Number(POOL_BASE) / 1e6} pool`)
console.error(`wrote ${OUT} → next: node scripts/build-merkle.mjs ${OUT}`)
