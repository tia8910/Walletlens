import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The small icon is the one part of a notification the user sees before they
// read a word of it, and it is easy to get wrong in a way no compiler catches:
// Android takes the icon's ALPHA CHANNEL, discards every colour, and tints the
// result. A full-colour bitmap therefore renders as a solid white square —
// technically working, visibly broken, and only ever discovered on a phone.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..',
  'walletlens_source/release_package/app/src/main')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const ICON = 'res/drawable/ic_notification_logo.xml'

describe('the notification small icon', () => {
  it('exists where the build expects it', () => {
    expect(existsSync(join(ROOT, ICON))).toBe(true)
  })

  it('is a vector on transparency, not the colour launcher icon', () => {
    // The launcher icon's plate is opaque edge to edge. Pointing the small
    // icon at it is the classic white-square bug.
    const src = read(ICON)
    expect(src).toContain('<vector')
    expect(src).not.toMatch(/ic_launcher\b/)
  })

  it('is the same mark as the themed launcher icon', () => {
    // Two drawings of one logo drift. The paths are shared verbatim; only the
    // frame around them differs, because a 108dp adaptive canvas and a 24dp
    // status bar want different padding.
    const icon = read(ICON)
    const mono = read('res/drawable/ic_launcher_monochrome.xml')
    const paths = (s) => (s.match(/android:pathData="([^"]+)"/g) || []).sort()
    expect(paths(icon), 'the mark itself is unchanged').toEqual(paths(mono))
  })

  it('is drawn at the size the status bar actually uses', () => {
    // 24dp is the platform's notification icon size. The launcher drawable is
    // 108dp with the mark filling about half of it — dropped into a status bar
    // unchanged, that is a smudge with a wide empty border.
    const src = read(ICON)
    expect(src).toMatch(/android:width="24dp"/)
    expect(src).toMatch(/android:viewportWidth="24"/)
  })

  it('fits inside the canvas it is given', () => {
    // The group transform is a fit, and a wrong number here pushes the mark
    // off the edge — clipped on a phone, silent everywhere else. Recomputed
    // from the artwork's own bounds rather than trusted.
    const src = read(ICON)
    const num = (attr) => Number(src.match(new RegExp(`android:${attr}="(-?[\\d.]+)"`))[1])
    const s = num('scaleX')
    const tx = num('translateX')
    const ty = num('translateY')
    expect(num('scaleY'), 'uniform scale — the mark must not stretch').toBe(s)

    // Bounds of the raw paths, strokes and round caps included.
    const RAW = { minX: 10.15, maxX: 53.85, minY: 7.93, maxY: 58.07 }
    const at = (v, t) => t + s * v
    for (const [name, v] of [
      ['left', at(RAW.minX, tx)], ['right', at(RAW.maxX, tx)],
      ['top', at(RAW.minY, ty)], ['bottom', at(RAW.maxY, ty)],
    ]) {
      expect(v, `${name} edge is inside the 24dp canvas`).toBeGreaterThanOrEqual(0)
      expect(v, `${name} edge is inside the 24dp canvas`).toBeLessThanOrEqual(24)
    }
    // Centred, so it does not sit off to one side of the status bar.
    expect((at(RAW.minX, tx) + at(RAW.maxX, tx)) / 2).toBeCloseTo(12, 1)
    expect((at(RAW.minY, ty) + at(RAW.maxY, ty)) / 2).toBeCloseTo(12, 1)
  })
})

describe('every notification the app can post uses it', () => {
  it('the ones this app draws itself', () => {
    const src = read('java/live/walletlens/twa/NotificationHelper.java')
    expect(src).toContain('R.drawable.ic_notification_logo')
    // Not resolved by name. getIdentifier survives no rename, is invisible to
    // R8, and returns 0 on a miss — which posts every notification under a
    // generic system icon with nothing to see in a log.
    expect(src, 'named for the compiler, not looked up at runtime')
      .not.toMatch(/getIdentifier\("ic_notification/)
  })

  it('the ones Firebase or the TWA service draw instead', () => {
    // Two meta-data entries: the TWA delegation service's SMALL_ICON, and
    // FCM's default for a message this app did not handle. Both were still
    // pointing at the old drawable after the Java side moved, which would have
    // left two icons in circulation.
    const manifest = read('AndroidManifest.xml')
    const refs = manifest.match(/android:resource="@drawable\/ic_notification[^"]*"/g) || []
    expect(refs.length, 'both meta-data entries').toBe(2)
    for (const r of refs) expect(r).toContain('ic_notification_logo')
  })

  it('leaves nothing pointing at the drawable that was removed', () => {
    for (const f of ['AndroidManifest.xml', 'res/raw/keep.xml',
                     'java/live/walletlens/twa/NotificationHelper.java']) {
      expect(read(f), `${f} still names the old icon`).not.toContain('ic_notification_chart')
    }
    expect(existsSync(join(ROOT, 'res/drawable-xxhdpi/ic_notification_chart.png')),
      'the orphaned bitmap is gone').toBe(false)
  })
})
