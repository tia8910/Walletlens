import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { translations, loadAllLanguages } from './i18n'
import { LANGUAGES } from './LanguageContext'

// The zakat channel toggle was first added as a Row inside PushToggle, next to
// the other per-channel switches — where SHOW_CHANNEL_DETAIL is `false`, so it
// rendered for nobody. It existed, it was translated, it was tested, and it
// was unreachable.
//
// These pin the two things that made it real: it lives in its own Settings
// section, and switching it on actually enables notifications rather than
// setting a flag that can never fire.

const SRC = dirname(fileURLToPath(import.meta.url))
const settings = readFileSync(join(SRC, 'pages', 'Settings.jsx'), 'utf8')
const toggle = readFileSync(join(SRC, 'components', 'ZakatNotifyToggle.jsx'), 'utf8')
const pushToggle = readFileSync(join(SRC, 'components', 'PushToggle.jsx'), 'utf8')
const icon = readFileSync(join(SRC, 'components', 'Icon.jsx'), 'utf8')

describe('the toggle is somewhere a person can reach it', () => {
  it('renders in Settings', () => {
    expect(settings).toMatch(/<ZakatNotifyToggle \/>/)
    expect(settings).toMatch(/import ZakatNotifyToggle from '\.\.\/components\/ZakatNotifyToggle'/)
  })

  it('has its own section with the crescent icon', () => {
    const section = settings.match(/<h3 className="settings-section-title"[^>]*>.*?setZakat.*?<\/h3>\s*<ZakatNotifyToggle \/>/s)
    expect(section, 'a Zakat section wrapping the toggle').not.toBeNull()
    expect(section[0]).toMatch(/name="crescent"/)
  })

  it('does not depend on the channel list to be reachable', () => {
    // PushToggle still carries a zakat Row — the file's own convention is to
    // keep built rows rather than delete them — but it must not be the only
    // place the toggle exists. It was, once, when that list was hidden behind
    // a build-time const, and the toggle vanished with it.
    //
    // The list is a runtime disclosure now, so it is reachable again; this
    // section stays independent of it regardless. A user looking for zakat
    // reminders should not have to know they are a notification channel.
    expect(pushToggle).not.toMatch(/SHOW_CHANNEL_DETAIL/)
    expect(toggle).not.toMatch(/channelsOpen/)
    expect(toggle).not.toMatch(/import[^\n]*(SHOW_CHANNEL_DETAIL|channelsOpen)/)
  })

  it('draws a crescent that Icon actually knows', () => {
    expect(icon).toMatch(/'crescent':\s*'M21 12\.79A9 9 0 1 1 11\.21 3 7 7 0 0 0 21 12\.79z'/)
  })
})

describe('switching it on does not set a flag that cannot fire', () => {
  it('enables notifications when they are off', () => {
    expect(toggle).toMatch(/import \{[^}]*\benablePush\b[^}]*\} from '\.\.\/push'/s)
    // The call is guarded on push being off, inside the turning-on branch.
    expect(toggle).toMatch(/if \(!enabled\) \{\s*await enablePush\(\)/)
  })

  it('sets the channel preference either way', () => {
    expect(toggle).toMatch(/setPushPrefs\(\{ zakat: true \}\)/)
    expect(toggle).toMatch(/setPushPrefs\(\{ zakat: false \}\)/)
  })

  it('never turns off every other notification on the way out', () => {
    // Silencing zakat is not a request to stop hearing about price targets.
    expect(toggle).not.toMatch(/disablePush/)
  })

  it('mirrors a permission changed from outside the app', () => {
    expect(toggle).toMatch(/watchPermission\(/)
  })
})

describe('it says what date it is pinned to', () => {
  it('reads the date the calculator wrote, not one of its own', () => {
    expect(toggle).toMatch(/import \{ loadDueDate \} from '\.\.\/zakat'/)
    expect(toggle).not.toMatch(/computeZakat|advanceHawl/)
  })

  it('says so plainly when there is no date yet', () => {
    expect(toggle).toMatch(/setZakatNoDate/)
    expect(toggle).toMatch(/setZakatNext/)
  })
})

describe('translation', () => {
  // Non-English dictionaries are code-split and fetched on demand, so
  // `translations` holds English alone until something loads the rest. The app
  // only ever needs the current language; a parity check needs all of them.
  beforeAll(loadAllLanguages)

  const keys = ['setZakat', 'setZakatNext', 'setZakatNoDate', 'npZakat', 'npZakatHint']

  it.each(LANGUAGES.map(l => l.code))('%s has every zakat settings string', (code) => {
    for (const k of keys) {
      const v = translations[code][k]
      expect(v, `${code}.${k}`).toBeTruthy()
      if (typeof v === 'string') expect(v.trim().length).toBeGreaterThan(0)
    }
  })

  it('renders the date line with and without a Hijri date', () => {
    for (const { code } of LANGUAGES) {
      const fn = translations[code].setZakatNext
      expect(typeof fn).toBe('function')
      const withHijri = fn('1 Jan 2026', '12 Rajab 1447 AH')
      const without = fn('1 Jan 2026', null)
      expect(withHijri).toContain('12 Rajab 1447 AH')
      expect(without).not.toContain('null')
      expect(without).not.toContain('undefined')
    }
  })
})
