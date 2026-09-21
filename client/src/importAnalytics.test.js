import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The importers were instrumented, and the instrumentation still could not
// answer "did anyone import by screenshot today". Two reasons, and this file
// holds both closed.
const here = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(here, f), 'utf8')

const analytics = read('analytics.js')
const dashboard = read('pages/Dashboard.jsx')
const smart = read('components/SmartImport.jsx')
const voice = read('components/VoiceImport.jsx')

describe('import analytics', () => {
  it('emits a success under its own event name', () => {
    // GA4 shows event NAMES with no setup and hides PARAMETERS until they are
    // registered as custom dimensions, and that registration is not
    // retroactive. So a success that exists only as import_step's 'saved'
    // value is invisible until someone remembers to declare a dimension, and
    // invisible for everything collected before they did.
    expect(analytics).toMatch(/export function importCompleted/)
    expect(analytics).toMatch(/track\('import_completed'/)
  })

  it('fires it from every method a user can finish an import with', () => {
    expect(smart, 'screenshot and spreadsheet').toMatch(/importCompleted\(\{ method: doneMethod \}\)/)
    expect(voice, 'voice').toMatch(/importCompleted\(\{ method: 'voice' \}\)/)
    expect(dashboard, 'backup restore').toMatch(/importCompleted\(\{ method: 'backup' \}\)/)
  })

  it('keeps the funnel adding up', () => {
    // import_completed is emitted ALONGSIDE step 'saved', never instead of it.
    // Replacing it would leave the funnel with a step that no longer closes.
    for (const [name, src] of [['SmartImport', smart], ['VoiceImport', voice]]) {
      const completed = (src.match(/importCompleted\(/g) || []).length
      const saved = (src.match(/step: 'saved'/g) || []).length
      expect(saved, `${name} still reports step 'saved'`).toBeGreaterThanOrEqual(completed)
    }
  })

  it('starts the funnel where the user starts', () => {
    // 'started' only fires once the file picker returns a file, so an importer
    // that was opened and abandoned left no trace at all — which is exactly
    // the drop worth seeing.
    expect(dashboard).toMatch(/trackImport\(\{ method: m\.key, step: 'opened' \}\)/)
  })

  it('normalises the method through one map', () => {
    // The UI calls the spreadsheet tile 'excel'; the funnel calls it
    // 'spreadsheet'. Left to two literals they drift, and one method becomes
    // two rows in a report that is then quietly wrong.
    expect(analytics).toMatch(/const IMPORT_METHODS = \{/)
    expect(analytics).toMatch(/excel: 'spreadsheet'/)
    // Nothing may send a raw tile key as the parameter any more.
    expect(dashboard).not.toMatch(/import_open', \{ method: m\.key \}/)
    expect(dashboard).toMatch(/import_method: importMethod\(m\.key\)/)
  })
})
