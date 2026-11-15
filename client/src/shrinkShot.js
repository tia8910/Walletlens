// A screenshot for a feedback report, made small enough to send: drawn onto a
// canvas at most MAX_SIDE pixels on its long side and saved as a JPEG, the
// quality stepped down until the data URL fits the report server's limit.
// Nothing leaves the device here; the caller decides whether to send it.

export const MAX_SIDE = 1280
export const MAX_SHOT_CHARS = 600_000
const QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4]

/** The size to draw at: the long side capped, the shape kept. Pure, for the test. */
export function fitSize(w, h, max = MAX_SIDE) {
  if (!(w > 0) || !(h > 0)) return null
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * k), h: Math.round(h * k) }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')) }
    img.src = url
  })
}

/** The file as a JPEG data URL within MAX_SHOT_CHARS, or a rejection. */
export async function shrinkShot(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('not_image')
  const img = await loadImage(file)
  let size = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height)
  if (!size) throw new Error('unreadable')
  // A very tall capture (a scrolled page) can stay over the limit at every
  // quality; then it is drawn smaller until it fits.
  for (let pass = 0; pass < 3; pass++) {
    const c = document.createElement('canvas')
    c.width = size.w; c.height = size.h
    const g = c.getContext('2d')
    g.fillStyle = '#fff'; g.fillRect(0, 0, size.w, size.h)
    g.drawImage(img, 0, 0, size.w, size.h)
    for (const q of QUALITIES) {
      const url = c.toDataURL('image/jpeg', q)
      if (url.length <= MAX_SHOT_CHARS) return url
    }
    size = { w: Math.round(size.w * 0.7), h: Math.round(size.h * 0.7) }
  }
  throw new Error('too_large')
}
