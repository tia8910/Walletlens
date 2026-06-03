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
    return await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'L', margin: 1, width: 260,
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

// Decode a QR from an uploaded image file (downscaled for memory safety).
export function decodeQrFromImageFile(file, onResult, onError) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      const maxDim = 1600
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const decoded = scanImageData(data)
      if (decoded) onResult(decoded)
      else onError('No QR code found in that image. Try a clearer, more cropped image.')
    } catch { onError('Could not read that image.') }
    finally { URL.revokeObjectURL(url) }
  }
  img.onerror = () => { URL.revokeObjectURL(url); onError('Could not open that image file.') }
  img.src = url
}
