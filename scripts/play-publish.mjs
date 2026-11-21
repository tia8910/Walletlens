// Publish an Android App Bundle to Google Play with the Play Developer API.
//
// Used by .github/workflows/build-aab.yml, in two steps:
//
//   node play-publish.mjs next-version
//       prints the next free version code: one above the highest code Play
//       has ever seen for this app, on any track. No more "version code
//       already used" refusals, and no more guessing what the last upload was.
//
//   node play-publish.mjs upload <aab> <track> <status> <versionName> [notes]
//       uploads the bundle and releases it on the track (internal, alpha,
//       beta or production), as a completed or draft release, with optional
//       English release notes, then commits the edit.
//
// Credentials: PLAY_SERVICE_ACCOUNT_JSON, a Google Cloud service-account key
// that Play Console has given "Release apps" permission for this app. Never
// committed; the workflow passes it in from a repository secret.
//
// googleapis is installed by the workflow next to this file, not added to the
// repo's dependencies: only this one CI step needs it.

import { readFileSync, createReadStream } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const PACKAGE_NAME = 'live.walletlens.twa'
export const TRACKS = ['internal', 'alpha', 'beta', 'production']
export const STATUSES = ['completed', 'draft']

/**
 * One above the highest version code in any release on any track, or in any
 * uploaded bundle. Play refuses a code it has already seen anywhere, even in a
 * bundle that was never released, so both lists count.
 */
export function nextVersionCode(tracks = [], bundles = []) {
  let max = 0
  for (const t of tracks || []) {
    for (const r of t?.releases || []) {
      for (const vc of r?.versionCodes || []) max = Math.max(max, Number(vc) || 0)
    }
  }
  for (const b of bundles || []) max = Math.max(max, Number(b?.versionCode) || 0)
  return max + 1
}

/** The track release body for one uploaded version code. */
export function releaseBody({ track, versionCode, status = 'completed', versionName = '', notes = '' }) {
  if (!TRACKS.includes(track)) throw new Error(`unknown track "${track}"; use one of ${TRACKS.join(', ')}`)
  if (!STATUSES.includes(status)) throw new Error(`unknown status "${status}"; use one of ${STATUSES.join(', ')}`)
  const release = { versionCodes: [String(versionCode)], status }
  if (versionName) release.name = String(versionName)
  const text = String(notes || '').trim()
  // Play caps release notes at 500 characters per language.
  if (text) release.releaseNotes = [{ language: 'en-US', text: text.slice(0, 500) }]
  return { track, releases: [release] }
}

async function client() {
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('PLAY_SERVICE_ACCOUNT_JSON is not set')
  // A variable, not a literal: only CI installs googleapis, and the tests
  // import this file for its pure helpers without it.
  const lib = 'googleapis'
  const { google } = await import(/* @vite-ignore */ lib)
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  })
  return google.androidpublisher({ version: 'v3', auth })
}

async function nextVersion() {
  const ap = await client()
  const packageName = PACKAGE_NAME
  const { data: edit } = await ap.edits.insert({ packageName })
  try {
    const [{ data: t }, { data: b }] = await Promise.all([
      ap.edits.tracks.list({ packageName, editId: edit.id }),
      ap.edits.bundles.list({ packageName, editId: edit.id }),
    ])
    return nextVersionCode(t.tracks, b.bundles)
  } finally {
    // Nothing was changed; leave no edit open behind us.
    await ap.edits.delete({ packageName, editId: edit.id }).catch(() => {})
  }
}

async function upload(aab, track, status, versionName, notes) {
  const ap = await client()
  const packageName = PACKAGE_NAME
  readFileSync(aab, { flag: 'r' }) // fail early and clearly if the bundle is missing
  const { data: edit } = await ap.edits.insert({ packageName })
  const { data: bundle } = await ap.edits.bundles.upload({
    packageName,
    editId: edit.id,
    media: { mimeType: 'application/octet-stream', body: createReadStream(aab) },
  })
  const requestBody = releaseBody({ track, versionCode: bundle.versionCode, status, versionName, notes })
  await ap.edits.tracks.update({ packageName, editId: edit.id, track, requestBody })
  await ap.edits.commit({ packageName, editId: edit.id })
  return bundle.versionCode
}

async function main(argv) {
  const [cmd, ...rest] = argv
  if (cmd === 'next-version') {
    process.stdout.write(String(await nextVersion()))
    return
  }
  if (cmd === 'upload') {
    const [aab, track, status, versionName, notes] = rest
    const vc = await upload(aab, track, status, versionName, notes)
    console.log(`Uploaded version code ${vc} to the ${track} track (${status}).`)
    return
  }
  throw new Error('usage: play-publish.mjs next-version | upload <aab> <track> <status> <versionName> [notes]')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    // The API's own message says exactly what is wrong (permissions, a used
    // version code, a track that does not exist yet); print it as is.
    console.error(`::error::Play publish failed: ${e?.errors?.[0]?.message || e?.message || e}`)
    process.exit(1)
  })
}
