// Getting a file out of the app: saving it, or sharing it.
//
// ── Why this is not just an <a download> ────────────────────────────────────
//
// In a browser it is. You make a blob URL, set `download` on an anchor, click
// it, and the browser saves the file. Every export in this app did that, and
// every share used navigator.share.
//
// The Android app's own WebView implements NEITHER. The anchor click is inert
// — no download, no error, no console message — and navigator.share is
// undefined. So on the day the app stopped being Chrome, the backup export,
// the QR image, the portfolio card and every share button became silent
// no-ops, on the one platform where "you can always take your data out" is the
// promise this app makes about privacy.
//
// Nothing threw, because a `catch {}` around a click that does nothing has
// nothing to catch. That is the same shape as the localNotify bug and the
// display-mode bug before it: a browser capability quietly absent, and every
// call site written to assume it.
//
// ── How it crosses ─────────────────────────────────────────────────────────
//
// As base64. The JavascriptInterface boundary passes strings and nothing else
// — no Blob, no ArrayBuffer, no File — so the bytes are encoded, handed over,
// and decoded in Java. It costs a third in size, which is why the native side
// refuses anything over 12MB rather than letting a large export take the app
// out with an OOM.

/** The bridge, when this page runs inside the app's own WebView. */
function shell() {
  try {
    const b = typeof window !== 'undefined' ? window.AndroidBridge : null
    return b && typeof b.saveFile === 'function' ? b : null
  } catch { return null }
}

/** Whether saving and sharing go through the app rather than the browser. */
export function savesThroughApp() {
  return shell() !== null
}

/**
 * A Blob as base64, without the data: prefix.
 *
 * readAsDataURL rather than reading the bytes and encoding by hand: btoa over
 * a large binary string is both slower and a stack-overflow risk once the
 * argument list gets long, and this runs on images.
 */
function toBase64(blob) {
  return new Promise((resolve, reject) => {
    try {
      const r = new FileReader()
      r.onerror = () => reject(new Error('could not read the file'))
      r.onload = () => {
        const s = String(r.result || '')
        const comma = s.indexOf(',')
        resolve(comma >= 0 ? s.slice(comma + 1) : '')
      }
      r.readAsDataURL(blob)
    } catch (e) { reject(e) }
  })
}

/** A data: URL or a Blob, whichever the caller had, as a Blob. */
async function asBlob(source, mimeType) {
  if (typeof source === 'string') {
    // A data: URL. fetch handles the base64 decode and gives back a Blob that
    // already carries the right type.
    const res = await fetch(source)
    return await res.blob()
  }
  if (source instanceof Blob) return source
  return new Blob([source], { type: mimeType || 'application/octet-stream' })
}

/**
 * Save a file where the user can find it.
 *
 * In the app: the Downloads folder, via the bridge, with a toast — a file that
 * lands silently reads as nothing having happened. In a browser: the download
 * the browser has always done.
 *
 * @param {Blob|string} source a Blob, or a data: URL
 * @param {string} filename
 * @returns {Promise<boolean>} whether it was saved
 */
export async function saveFile(source, filename) {
  const blob = await asBlob(source)
  const b = shell()

  if (b) {
    try {
      return !!b.saveFile(filename, blob.type || '', await toBase64(blob))
    } catch { return false }
  }

  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on a turn of the loop, not immediately: Safari has not finished
    // with the URL when click() returns and saves an empty file if it is gone.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch { return false }
}

/**
 * Offer a file to the share sheet, falling back to saving it.
 *
 * The fallback matters more than it looks: a desktop browser with no
 * navigator.share, and an app whose share sheet the user backs out of, should
 * both leave the user holding the file rather than nothing.
 *
 * @returns {Promise<'shared'|'saved'|'failed'>}
 */
export async function shareFile(source, filename, { text = '', title = '' } = {}) {
  const blob = await asBlob(source)
  const b = shell()

  if (b) {
    try {
      if (b.shareFile(filename, blob.type || '', await toBase64(blob), text)) return 'shared'
    } catch { /* fall through to saving it */ }
    return (await saveFile(blob, filename)) ? 'saved' : 'failed'
  }

  try {
    const file = new File([blob], filename, { type: blob.type || 'image/png' })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text, title })
      return 'shared'
    }
  } catch (e) {
    // AbortError is the user closing the sheet. That is a decision, not a
    // failure, and must not be answered by saving a file they did not ask for.
    if (e?.name === 'AbortError') return 'shared'
  }

  return (await saveFile(blob, filename)) ? 'saved' : 'failed'
}

/**
 * Share plain text or a link.
 *
 * @returns {Promise<boolean>} whether a share sheet was opened
 */
export async function shareText(text, { title = '', url = '' } = {}) {
  const body = url ? `${text} ${url}`.trim() : text
  const b = shell()

  if (b) {
    try { return !!b.shareText(body, title) } catch { return false }
  }

  try {
    if (navigator.share) {
      await navigator.share({ text, title, ...(url ? { url } : {}) })
      return true
    }
  } catch (e) {
    if (e?.name === 'AbortError') return true
    return false
  }
  return false
}
