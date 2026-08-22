import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Android treats a notification badge as a MASK: it discards the colour and
// keeps only the alpha channel, then tints what survives. Handing it a normal
// app icon — an opaque rounded plate with the mark drawn on top — makes the
// plate the mask, and the status bar shows a featureless grey square. That
// shipped, and it looked like a missing icon rather than a wrong one.

const pub = join(dirname(fileURLToPath(import.meta.url)), '../public')
const sw = readFileSync(join(pub, 'sw.js'), 'utf8')

/**
 * Alpha coverage of a PNG, without an image library.
 *
 * Reads the IHDR for dimensions and colour type, inflates the IDAT stream, and
 * walks the scanlines undoing the per-row filter. Only RGBA (colour type 6) is
 * supported, which is what the badge is and must remain.
 */
function alphaStats(file) {
  const buf = readFileSync(file)
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))

  let pos = 8
  let width = 0, height = 0, bitDepth = 0, colorType = -1
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }

  expect(colorType, `${file} must be RGBA to carry an alpha channel`).toBe(6)
  expect(bitDepth).toBe(8)

  const { inflateSync } = require('node:zlib')
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let v = row[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 0xff
    }
  }

  let opaque = 0, clear = 0
  for (let i = 3; i < out.length; i += 4) {
    if (out[i] > 250) opaque++
    else if (out[i] < 5) clear++
  }
  const px = width * height
  return { width, height, opaque: opaque / px, clear: clear / px }
}

describe('the notification badge is a silhouette, not a square', () => {
  it('uses a dedicated badge asset, not the app icon', () => {
    expect(sw).toMatch(/badge: '\/badge-96\.png'/)
    expect(sw).not.toMatch(/badge: '\/icon-192\.png'/)
  })

  it('is mostly transparent, so the mask is the mark', () => {
    const b = alphaStats(join(pub, 'badge-96.png'))
    expect(b.width).toBe(96)
    expect(b.height).toBe(96)
    // A silhouette: most of the canvas is empty and the ink is a minority.
    expect(b.clear).toBeGreaterThan(0.5)
    expect(b.opaque).toBeLessThan(0.4)
    // But not blank — an all-transparent badge shows nothing at all.
    expect(b.opaque).toBeGreaterThan(0.05)
  })

  it('demonstrates why the app icon cannot serve as one', () => {
    // Kept as the contrast case: this is what was shipping, and its mask is a
    // filled rectangle. If someone ever makes the app icon transparent this
    // test should be revisited, not deleted.
    const i = alphaStats(join(pub, 'icon-192.png'))
    expect(i.opaque).toBeGreaterThan(0.9)
  })

  it('precaches the badge, since pushes arrive with the app closed', () => {
    expect(sw).toMatch(/'\/badge-96\.png',/)
  })

  it('bumps the service worker version so the change reaches devices', () => {
    const v = sw.match(/const SW_VERSION = 'v(\d+)'/)
    expect(v).toBeTruthy()
    expect(Number(v[1])).toBeGreaterThanOrEqual(222)
  })
})
