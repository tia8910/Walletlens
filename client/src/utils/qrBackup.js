// Shared QR helpers for backup export/import (used by BackupCode and the
// Dashboard DataPanel). Supports multi-part QR codes for large backups.
import QRCode from 'qrcode'
import jsQR from 'jsqr'

// ~2900 bytes fits a version-40 QR at low error correction.
export const QR_MAX_BYTES = 2900
// Payload chars per QR when a backup is split across multiple codes. Kept well
// under capacity so the `WQ<i>/<n>:` header fits and codes stay easy to scan.
export const QR_CHUNK = 2000

export async function makeQr(data) {
  try {
    // scale (px per module) instead of a fixed width: a near-capacity v40
    // code is 177×177 modules — forcing it into 260px gave ~1.4px/module,
    // an image no decoder (including ours) could read back.
    return await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'L', margin: 2, scale: 5,
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch { return '' }
}

// Returns an array of { idx, total, url }. Small codes → a single plain QR.
// Larger codes → a sequence of `WQ<i>/<n>:<chunk>` QR codes.
export async function makeQrParts(code) {
  if (code.length <= QR_MAX_BYTES) {
    const url = await makeQr(code)
    return url ? [{ idx: 1, total: 1, url }] : []
  }
  const total = Math.ceil(code.length / QR_CHUNK)
  const parts = []
  for (let i = 0; i < total; i++) {
    const chunk = code.slice(i * QR_CHUNK, (i + 1) * QR_CHUNK)
    const url = await makeQr(`WQ${i + 1}/${total}:${chunk}`)
    if (!url) return []
    parts.push({ idx: i + 1, total, url })
  }
  return parts
}

// Creates a stateful collector for multi-part scans. Feed it each scanned
// string; returns { complete:true, text } once all parts are captured, or
// { complete:false, got, total } while still in progress.
export function createPartCollector() {
  const parts = {}
  return (data) => {
    const m = /^WQ(\d+)\/(\d+):([\s\S]*)$/.exec(data)
    if (!m) return { complete: true, text: data } // plain single QR
    const idx = +m[1], total = +m[2], chunk = m[3]
    parts[idx] = chunk
    for (let i = 1; i <= total; i++) {
      if (parts[i] == null) return { complete: false, got: Object.keys(parts).length, total }
    }
    let full = ''
    for (let i = 1; i <= total; i++) full += parts[i]
    return { complete: true, text: full }
  }
}

// Run jsQR over a canvas ImageData; returns the decoded string or null.
export function scanImageData(imageData) {
  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
  return code?.data || null
}

// Native QR detector (Android/Chrome/desktop Chromium) — best at locating a QR
// anywhere in a photo or screenshot. Returns null where unsupported/failed.
async function detectNative(source) {
  try {
    if (typeof BarcodeDetector === 'undefined') return null
    const det = new BarcodeDetector({ formats: ['qr_code'] })
    const codes = await det.detect(source)
    return codes?.[0]?.rawValue || null
  } catch { return null }
}

// jsQR one attempt at a given canvas — never throws.
function jsqrAt(img, targetLong) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight
    const long = Math.max(w, h) || 1
    const scale = targetLong / long
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })?.data || null
  } catch { return null }
}

// Decode a QR from an uploaded image. Tries the native detector on the raw
// bitmap first (handles QRs embedded in full-screen screenshots), then jsQR at
// several target sizes: the native resolution, a ~1000px sweet spot (jsQR is
// most reliable there), and 2×/3× upscales for tiny/dense exported codes.
// Every step is guarded so a genuinely-unreadable image reports "no QR found"
// rather than the misleading "could not read".
export function decodeQrFromImageFile(file, onResult, onError) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = async () => {
    try {
      const long = Math.max(img.naturalWidth, img.naturalHeight) || 1
      let decoded = null

      // 1) Native detector on the raw image (createImageBitmap → detect).
      try {
        const bmp = await createImageBitmap(img)
        decoded = await detectNative(bmp)
        bmp.close?.()
      } catch { /* fall through */ }

      // 2) jsQR at a ladder of target sizes (capped at 3000px for phone memory).
      if (!decoded) {
        const targets = [...new Set(
          [long, 1000, Math.min(long * 2, 3000), Math.min(long * 3, 3000)]
            .map(t => Math.min(Math.max(1, Math.round(t)), 3000))
        )]
        for (const t of targets) {
          decoded = jsqrAt(img, t)
          if (decoded) break
        }
      }

      if (decoded) onResult(decoded)
      else onError('No QR code found in that image. Make sure it is the WalletLens backup QR, cropped and not blurry.')
    } catch {
      onError('Could not read that image.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  img.onerror = () => { URL.revokeObjectURL(url); onError('Could not open that image file.') }
  img.src = url
}
