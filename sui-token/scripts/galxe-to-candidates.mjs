#!/usr/bin/env node
// Convert a Galxe/Zealy participant export into a candidates list for the airdrop
// pipeline. Scans any CSV (whatever the column layout) for Sui addresses, de-dupes,
// and writes one address per line — ready for prepare-snapshot.mjs.
//
//   node scripts/galxe-to-candidates.mjs <platform-export.csv> [candidates.csv]
//
// Also merges extra lists if you pass more files (e.g. the waitlist /export CSV):
//   node scripts/galxe-to-candidates.mjs galxe.csv waitlist.csv -o candidates.csv
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const oIdx = args.indexOf('-o')
const out = oIdx >= 0 ? args[oIdx + 1] : (args.length > 1 && !args[1].startsWith('-') && args.length === 2 ? args[1] : 'candidates.csv')
const inputs = (oIdx >= 0 ? args.filter((_, i) => i !== oIdx && i !== oIdx + 1) : (args.length === 2 ? [args[0]] : args))
  .filter(Boolean)
if (!inputs.length) { console.error('usage: node scripts/galxe-to-candidates.mjs <export.csv> [more.csv ...] [-o candidates.csv]'); process.exit(1) }

const ADDR_RE = /0x[0-9a-fA-F]{64}/g
const found = new Set()
for (const f of inputs) {
  const text = readFileSync(f, 'utf8')
  for (const m of text.match(ADDR_RE) ?? []) found.add(m.toLowerCase())
  console.error(`${f}: ${ (text.match(ADDR_RE) ?? []).length } address hits`)
}
if (!found.size) { console.error('No Sui addresses found in the input file(s).'); process.exit(1) }

writeFileSync(out, ['address', ...found].join('\n') + '\n')
console.error(`✓ wrote ${out} — ${found.size} unique Sui addresses`)
console.error(`next: node scripts/prepare-snapshot.mjs ${out} --pool <LENZ> --min-tx 1`)
