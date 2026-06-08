#!/usr/bin/env node
// Build the $LENZ airdrop Merkle tree from a snapshot CSV.
//   node scripts/build-merkle.mjs <snapshot.csv> [outDir]
//
// CSV: two columns "address,amount" (header optional). `amount` is in BASE UNITS
// (1 LENZ = 1,000,000). Addresses are Sui 0x + 64 hex.
//
// Hashing MUST match sources/airdrop.move:
//   leaf = sha256( addressBytes(32) || amountLE_u64(8) )
//   node = sha256( sort(left, right) )      // sorted pairs; odd nodes carried up
//
// Outputs (in outDir, default ./airdrop-out):
//   root.txt       — 0x… 32-byte root (pass to `airdrop::create`)
//   proofs.json    — { "<address>": { "amount": "<baseUnits>", "proof": ["0x…", …] } }
//   summary.json   — { count, totalBaseUnits, totalLenz, root }
//
// Uses only Node built-ins (sha256) — no dependencies. Node >= 16.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const sha256 = (buf) => createHash('sha256').update(buf).digest()
const toHex = (b) => '0x' + Buffer.from(b).toString('hex')
const ADDR_RE = /^0x[0-9a-fA-F]{64}$/

function leafHash(addr, amount) {
  if (!ADDR_RE.test(addr)) throw new Error(`bad Sui address: ${addr}`)
  const a = Buffer.from(addr.slice(2), 'hex') // 32 bytes
  const amt = Buffer.alloc(8)
  amt.writeBigUInt64LE(BigInt(amount))
  return sha256(Buffer.concat([a, amt]))
}
function hashPair(x, y) {
  const [lo, hi] = Buffer.compare(x, y) <= 0 ? [x, y] : [y, x]
  return sha256(Buffer.concat([lo, hi]))
}
function buildLayers(leaves) {
  const layers = [leaves]
  let layer = leaves
  while (layer.length > 1) {
    const next = []
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 === layer.length) next.push(layer[i])        // carry odd node up
      else next.push(hashPair(layer[i], layer[i + 1]))
    }
    layers.push(next)
    layer = next
  }
  return layers
}
function proofFor(layers, index) {
  const proof = []
  let idx = index
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l]
    const sib = idx ^ 1
    if (sib < layer.length) proof.push(toHex(layer[sib]))     // skip when carried
    idx = idx >> 1
  }
  return proof
}

const [csvPath, outDir = 'airdrop-out'] = process.argv.slice(2)
if (!csvPath) { console.error('usage: node scripts/build-merkle.mjs <snapshot.csv> [outDir]'); process.exit(1) }

const rows = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/)
  .map(l => l.trim()).filter(Boolean)
  .filter(l => !/^address\s*,/i.test(l))            // drop header
  .map(l => { const [address, amount] = l.split(',').map(s => s.trim()); return { address, amount } })

if (rows.length === 0) { console.error('no rows in CSV'); process.exit(1) }

// Detect duplicate addresses (a wallet must appear once).
const seen = new Set()
for (const r of rows) {
  const k = r.address.toLowerCase()
  if (seen.has(k)) throw new Error(`duplicate address in snapshot: ${r.address}`)
  seen.add(k)
}

// Safety net: enforce a hard per-wallet cap so no single address is over-allocated.
// Override with --cap <LENZ>; default ~0.1% of supply (10,000 LENZ).
const capArgI = process.argv.indexOf('--cap')
const CAP_BASE = BigInt(Math.round(parseFloat(capArgI >= 0 ? process.argv[capArgI + 1] : '10000') * 1e6))
for (const r of rows) {
  if (BigInt(r.amount) > CAP_BASE) {
    throw new Error(`amount for ${r.address} (${Number(r.amount) / 1e6} LENZ) exceeds per-wallet cap (${Number(CAP_BASE) / 1e6} LENZ). Use prepare-snapshot.mjs or pass --cap.`)
  }
}

const leaves = rows.map(r => leafHash(r.address, r.amount))
const layers = buildLayers(leaves)
const root = toHex(layers[layers.length - 1][0])

const proofs = {}
let total = 0n
rows.forEach((r, i) => {
  proofs[r.address] = { amount: String(r.amount), proof: proofFor(layers, i) }
  total += BigInt(r.amount)
})

mkdirSync(outDir, { recursive: true })
writeFileSync(`${outDir}/root.txt`, root + '\n')
writeFileSync(`${outDir}/proofs.json`, JSON.stringify(proofs, null, 2))
writeFileSync(`${outDir}/summary.json`, JSON.stringify({
  count: rows.length,
  totalBaseUnits: String(total),
  totalLenz: Number(total) / 1e6,
  root,
}, null, 2))

console.log(`✓ ${rows.length} addresses`)
console.log(`✓ total: ${Number(total) / 1e6} LENZ (${total} base units) — fund the airdrop with exactly this`)
console.log(`✓ root: ${root}`)
console.log(`✓ wrote ${outDir}/root.txt, proofs.json, summary.json`)
