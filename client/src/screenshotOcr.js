// Reads the text of a screenshot on the device itself.
//
// tesseract.js runs in a web worker with its WebAssembly core and the English
// model, all served from this site under /ocr/ (see ocrAssetsPlugin in
// vite.config.js). Nothing about the image leaves the phone: no upload, no
// key, no service to be down. The first use downloads ~7 MB, which the
// browser then keeps; every later screenshot is read offline.
//
// What comes back is every word with its box, in image pixels. Turning those
// into holdings is screenshotParse.js, which is pure and tested on its own.

const OCR_BASE = '/ocr'

let _worker = null

async function getWorker() {
  if (!_worker) {
    _worker = (async () => {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1 /* LSTM only */, {
        workerPath: `${OCR_BASE}/worker.min.js`,
        corePath: OCR_BASE,
        langPath: OCR_BASE,
        // A blob: worker would need `worker-src blob:` in the CSP; the
        // same-origin script needs nothing new.
        workerBlobURL: false,
        gzip: true,
      })
      // Sparse text: a portfolio screen is columns and labels, not paragraphs,
      // and every word is placed by its own box afterwards anyway.
      await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' })
      return worker
    })()
    // A failed start (offline on first use) must not stick for the session.
    _worker.catch(() => { _worker = null })
  }
  return _worker
}

/** Start loading the reader before the first screenshot is picked. */
export function warmUpOcr() {
  getWorker().catch(() => {})
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable_image')) }
    img.src = url
  })
}

// The model reads dark text on a light page best, at a text height of roughly
// 20 to 40 px. Phone screenshots are usually fine as they are; a small crop is
// enlarged, a huge one reduced, and a dark-mode screen inverted, all in grey.
export function prepareCanvas(img) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height
  const scale = w0 < 900 ? Math.min(2.5, 1400 / w0) : w0 > 2400 ? 2400 / w0 : 1
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  let sum = 0
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  const dark = sum / (px.length / 4) < 110
  for (let i = 0; i < px.length; i += 4) {
    let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    if (dark) g = 255 - g
    px[i] = px[i + 1] = px[i + 2] = g
  }
  ctx.putImageData(data, 0, 0)
  return { canvas, scale }
}

/**
 * Every word in the screenshot: [{ text, conf, x0, y0, x1, y1 }], in the
 * coordinates of the original image.
 */
export async function readScreenshotWords(file) {
  const img = await loadImage(file)
  const { canvas, scale } = prepareCanvas(img)
  let worker
  try { worker = await getWorker() } catch { throw new Error('ocr_unavailable') }
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
  const words = []
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const wd of l.words || []) {
    const text = String(wd.text || '').trim()
    if (!text) continue
    const bb = wd.bbox
    words.push({ text, conf: wd.confidence, x0: bb.x0 / scale, y0: bb.y0 / scale, x1: bb.x1 / scale, y1: bb.y1 / scale })
  }
  return words
}
