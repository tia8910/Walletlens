// Reads a Deno KV database and writes a .sql file for `wrangler d1 execute`.
//
// Run it from the repo root:
//
//   DENO_KV_ACCESS_TOKEN=... deno run --allow-net --allow-env --allow-write \
//     workers/migrate/export-kv.ts --service=push --db=<uuid> --out=push.sql
//
// The token is read from the environment and never written to the output. See
// README.md for where to get it and what to do with the file afterwards.

import { buildFile } from './sqlgen.js'

type Service = 'push' | 'voice'

function arg(name: string): string | undefined {
  const hit = Deno.args.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function die(msg: string): never {
  console.error(`error: ${msg}`)
  Deno.exit(1)
}

const service = arg('service') as Service | undefined
if (service !== 'push' && service !== 'voice') die('--service must be push or voice')

const db = arg('db')
if (!db) die('--db=<database-uuid> is required (Deno Deploy → project → KV)')

const out = arg('out') ?? `${service}-import.sql`
const overwrite = Deno.args.includes('--overwrite')

if (!Deno.env.get('DENO_KV_ACCESS_TOKEN')) {
  die('DENO_KV_ACCESS_TOKEN is not set; create one at dash.deno.com/account#access-tokens')
}

// The remote-connect form. Deno.openKv() with no argument would open a local
// file, which would silently export nothing rather than fail.
const kv = await Deno.openKv(`https://api.deno.com/databases/${db}/connect`)

// One scan of everything, rather than a scan per prefix. The export is a
// read-heavy operation against the very quota that ran out, so it is worth
// paying for exactly once — and an empty prefix cannot miss a key that a
// hardcoded prefix list forgot about.
const entries: { key: unknown[]; value: unknown }[] = []
for await (const e of kv.list({ prefix: [] })) {
  entries.push({ key: e.key as unknown[], value: e.value })
}
await kv.close()

const { text, count, skipped } = buildFile(service, entries, { overwrite })

if (count === 0) {
  die(
    `scanned ${entries.length} entrie(s) and matched none. ` +
      `Check --db points at the ${service} project's KV database.`,
  )
}

await Deno.writeTextFile(out, text)

console.log(`scanned  ${entries.length} KV entrie(s)`)
console.log(`exported ${count} row(s) -> ${out}`)
if (skipped.length) {
  // For push this is expected only if the database holds something other than
  // ["sub", …]. Printing the keys makes an unexpected shape visible instead of
  // quietly dropping it.
  console.log(`skipped  ${skipped.length} key(s) that are not ["sub", …]:`)
  for (const k of skipped.slice(0, 10)) console.log(`  ${JSON.stringify(k)}`)
  if (skipped.length > 10) console.log(`  … and ${skipped.length - 10} more`)
}
