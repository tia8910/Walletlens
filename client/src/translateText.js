// Runtime translation for text that cannot live in i18n.js because it does not
// exist until the page loads — currently only news headlines from the RSS feeds.
//
// PRIVACY: only ever pass text that was already public. Headlines qualify.
// Nothing derived from the user's portfolio may go through here — same rule as
// analytics.js, and for the same reason: it leaves the device.
//
// Two caches, because this costs the site owner money per call:
//   - localStorage, so a headline already translated on this device is free
//     forever and survives a reload
//   - the endpoint caches at the edge, so the first reader of a new batch pays
//     and everyone after them does not

const CACHE_KEY = 'wl_tr_cache'
const MAX_ENTRIES = 400   // ~40 headlines x a few languages, with room to spare
// Small batches. 24 headlines in one request ran past the model's output cap
// or the timeout (Arabic in particular takes many tokens), and then the whole
// batch failed and every headline stayed English. Six fit easily, the first
// batch is the headlines on screen, and a failure costs six, not all.
const MAX_BATCH = 6
const PARALLEL = 3

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function saveCache(map) {
  try {
    // Trim oldest-first when it grows. Insertion order in a plain object is
    // good enough here: entries are only ever appended.
    const keys = Object.keys(map)
    if (keys.length > MAX_ENTRIES) {
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k]
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(map))
  } catch { /* quota or private mode: translation just stops being sticky */ }
}

const keyFor = (lang, text) => `${lang}:${text}`

/**
 * Translate a list of strings, returning them in the same order.
 *
 * Never rejects and never throws: if the endpoint is unreachable, not
 * configured, or returns something unexpected, the original English comes
 * back. A ticker in English is a much better outcome than a ticker that
 * disappeared, so every failure path here is "return what you were given".
 *
 * @param {string[]} texts
 * @param {string}   lang  'ar' | 'fr' | 'es' | 'de' | 'it'  (anything else is a no-op)
 * @param {(partial: string[]) => void} [onPartial]  called as early batches land
 */
export async function translateBatch(texts, lang, onPartial) {
  if (!Array.isArray(texts) || !texts.length) return texts || []
  if (!lang || lang === 'en') return texts

  const cache = loadCache()
  const out = texts.slice()
  const missingIdx = []

  texts.forEach((t, i) => {
    const hit = cache[keyFor(lang, t)]
    if (hit) out[i] = hit
    else if (t && t.trim()) missingIdx.push(i)
  })

  if (!missingIdx.length) return out

  // One request per chunk, a few at a time, in feed order so the headlines
  // on screen come back first.
  const chunks = []
  for (let start = 0; start < missingIdx.length; start += MAX_BATCH) chunks.push(missingIdx.slice(start, start + MAX_BATCH))
  const runChunk = async (idxs) => {
    const payload = idxs.map(i => texts[i])
    try {
      const resp = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: payload, lang }),
      })
      if (!resp.ok) {
        // Visible in the console, so "news is still English" can be told
        // apart: not_configured (no API key) vs an upstream failure.
        try { console.warn('[news] translate', resp.status, (await resp.json())?.error) } catch { /* no body */ }
        return
      }
      const data = await resp.json()
      const list = data?.translations
      if (!Array.isArray(list) || list.length !== payload.length) return
      idxs.forEach((srcIdx, n) => {
        const translated = list[n]
        if (typeof translated === 'string' && translated.trim()) {
          out[srcIdx] = translated
          cache[keyFor(lang, texts[srcIdx])] = translated
        }
      })
    } catch { /* offline or blocked: leave this chunk in English */ }
  }
  for (let c = 0; c < chunks.length; c += PARALLEL) {
    await Promise.all(chunks.slice(c, c + PARALLEL).map(runChunk))
    // The headlines on screen are in the first round; show them now rather
    // than after the whole feed.
    if (typeof onPartial === 'function' && c + PARALLEL < chunks.length) {
      try { onPartial(out.slice()) } catch { /* caller's problem */ }
    }
  }

  saveCache(cache)
  return out
}
