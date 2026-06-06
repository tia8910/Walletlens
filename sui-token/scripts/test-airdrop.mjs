#!/usr/bin/env node
// End-to-end airdrop test on Sui testnet (no manual vector args).
// Creates a 2-leaf Merkle airdrop funded with 1 LENZ, claims it, then proves a
// second claim is rejected (EAlreadyClaimed). Read-keys-from-env; testnet only.
//
//   cd sui-token
//   npm install @mysten/sui@^1        (v1 API — NOT the v2 major)
//   sui keytool export --key-identity <your-address>      # copy the suiprivkey...
//   set SUI_PKG=0x049ba922...c8f5      (Windows;  use `export` on mac/linux)
//   set SUI_PRIVKEY=suiprivkey1......
//   node scripts/test-airdrop.mjs
import { createHash } from 'node:crypto'
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'
import { Transaction } from '@mysten/sui/transactions'
import { bcs } from '@mysten/sui/bcs'

const PKG = process.env.SUI_PKG
const PRIV = process.env.SUI_PRIVKEY
if (!PKG || !PRIV) { console.error('Set SUI_PKG and SUI_PRIVKEY env vars first.'); process.exit(1) }

const COIN_TYPE = `${PKG}::lenz::LENZ`
const AMOUNT = 1_000_000n           // 1 LENZ (6 decimals)
const DUMMY = '0x' + '0'.repeat(63) + '1'   // a second leaf so the proof is non-empty

// --- Merkle (must match sources/airdrop.move) ---------------------------------
const sha = (b) => createHash('sha256').update(b).digest()
const leaf = (addr, amt) => {
  const a = Buffer.from(addr.slice(2).padStart(64, '0'), 'hex')   // 32 bytes
  const m = Buffer.alloc(8); m.writeBigUInt64LE(amt)
  return sha(Buffer.concat([a, m]))
}
const pair = (x, y) => sha(Buffer.compare(x, y) <= 0 ? Buffer.concat([x, y]) : Buffer.concat([y, x]))

const client = new SuiClient({ url: getFullnodeUrl('testnet') })
const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(PRIV).secretKey)
const me = kp.getPublicKey().toSuiAddress()
console.log('Address:', me)

const L0 = leaf(me, AMOUNT)
const L1 = leaf(DUMMY, AMOUNT)
const root = pair(L0, L1)
const proof = [L1]                  // sibling for my leaf (index 0)
console.log('Merkle root:', '0x' + root.toString('hex'))

const exec = (tx) => client.signAndExecuteTransaction({
  signer: kp, transaction: tx,
  options: { showObjectChanges: true, showEffects: true },
})
const vecU8 = (b) => bcs.vector(bcs.u8()).serialize(Array.from(b)).toBytes()
const vecVecU8 = (arr) => bcs.vector(bcs.vector(bcs.u8())).serialize(arr.map(p => Array.from(p))).toBytes()

async function main() {
  // 0. find a LENZ coin to fund the airdrop
  const coins = await client.getCoins({ owner: me, coinType: COIN_TYPE })
  if (!coins.data.length) { console.error('No LENZ coins found for', me); process.exit(1) }
  const lenzCoin = coins.data[0].coinObjectId
  console.log('Funding from LENZ coin:', lenzCoin)

  // 1. create the airdrop, funded with exactly AMOUNT
  let tx = new Transaction()
  const [pool] = tx.splitCoins(tx.object(lenzCoin), [tx.pure.u64(AMOUNT)])
  tx.moveCall({ target: `${PKG}::airdrop::create`, arguments: [pool, tx.pure(vecU8(root))] })
  const created = await exec(tx)
  if (created.effects?.status?.status !== 'success') throw new Error('create failed: ' + JSON.stringify(created.effects?.status))
  const adObj = created.objectChanges.find(c => c.objectType?.endsWith('::airdrop::Airdrop'))
  const airdropId = adObj.objectId
  console.log('✅ Airdrop created:', airdropId)

  // 2. claim
  let tx2 = new Transaction()
  tx2.moveCall({ target: `${PKG}::airdrop::claim`,
    arguments: [tx2.object(airdropId), tx2.pure.u64(AMOUNT), tx2.pure(vecVecU8(proof))] })
  const claimed = await exec(tx2)
  if (claimed.effects?.status?.status !== 'success') throw new Error('claim failed: ' + JSON.stringify(claimed.effects?.status))
  console.log('✅ Claim succeeded — 1 LENZ paid out. tx:', claimed.digest)

  // 3. claim again — must be rejected (EAlreadyClaimed = abort 0)
  try {
    let tx3 = new Transaction()
    tx3.moveCall({ target: `${PKG}::airdrop::claim`,
      arguments: [tx3.object(airdropId), tx3.pure.u64(AMOUNT), tx3.pure(vecVecU8(proof))] })
    const again = await exec(tx3)
    if (again.effects?.status?.status === 'success') { console.error('❌ DOUBLE-CLAIM SUCCEEDED — bug!'); process.exit(1) }
    console.log('✅ Double-claim correctly rejected:', again.effects?.status?.error)
  } catch (e) {
    console.log('✅ Double-claim correctly rejected (aborted):', String(e).split('\n')[0])
  }

  console.log('\n🎉 AIRDROP TEST PASSED — create, claim, and double-claim protection all work.')
}
main().catch(e => { console.error('TEST ERROR:', e); process.exit(1) })
