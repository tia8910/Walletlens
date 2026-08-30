import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The microphone and camera, which a WebView grants the page nothing of.
//
// Under the TWA the page ran in Chrome, so Chrome held both permissions and
// raised its own prompts. In the app's own WebView the page can only reach
// hardware THIS app is allowed to touch — and with nothing declared and
// nothing answering the request, voice import reported a denied microphone on
// a device that had never been asked.

const SRC = dirname(fileURLToPath(import.meta.url))
const ANDROID = join(SRC, '..', '..', 'walletlens_source/release_package/app/src/main')

let mod
async function load() {
  vi.resetModules()
  mod = await import('./nativeMedia.js')
  return mod
}

beforeEach(() => { delete window.AndroidBridge })
afterEach(() => { delete window.AndroidBridge })

describe('the microphone, in a browser', () => {
  it('leaves the decision to the browser', async () => {
    // getUserMedia raises the browser's own prompt at the moment of capture.
    // Getting in the way of that would be a second gate on a working path.
    const { ensureMicPermission, micAllowed } = await load()
    expect(micAllowed()).toBe(true)
    expect(await ensureMicPermission()).toBe(true)
  })
})

describe('the microphone, in the app', () => {
  it('does not ask when the app already holds it', async () => {
    const requestMic = vi.fn()
    window.AndroidBridge = { requestMic, micAllowed: () => true }
    const { ensureMicPermission } = await load()

    expect(await ensureMicPermission()).toBe(true)
    expect(requestMic).not.toHaveBeenCalled()
  })

  it('asks, then reports what the user chose', async () => {
    let granted = false
    const requestMic = vi.fn(() => { granted = true })
    window.AndroidBridge = { requestMic, micAllowed: () => granted }
    const { ensureMicPermission } = await load()

    expect(await ensureMicPermission()).toBe(true)
    expect(requestMic).toHaveBeenCalled()
  })

  it('survives a bridge that throws', async () => {
    window.AndroidBridge = {
      requestMic: () => { throw new Error('binder died') },
      micAllowed: () => false,
    }
    const { ensureMicPermission } = await load()
    expect(await ensureMicPermission()).toBe(false)
  })
})

describe('the native side', () => {
  const manifest = readFileSync(join(ANDROID, 'AndroidManifest.xml'), 'utf8')
  const shell = readFileSync(
    join(ANDROID, 'java/live/walletlens/twa/AppShellActivity.java'), 'utf8')

  it('declares the permissions the page needs', () => {
    // Without these the page cannot reach the hardware however the WebView
    // answers, because the app itself is not allowed to.
    expect(manifest).toMatch(/android\.permission\.RECORD_AUDIO/)
    expect(manifest).toMatch(/android\.permission\.CAMERA/)
  })

  it('still installs on a device with neither', () => {
    // required="false", or a phone without a camera cannot install the app at
    // all — for a feature it would simply never be offered.
    const features = manifest.match(/<uses-feature[^>]*>/g) || []
    const hardware = features.filter(f => /microphone|camera/.test(f))
    expect(hardware.length).toBe(2)
    for (const f of hardware) expect(f).toMatch(/android:required="false"/)
  })

  it('answers the page instead of leaving it denied', () => {
    // An unanswered PermissionRequest is a denied one, and the page cannot
    // tell that apart from the user refusing.
    expect(shell).toMatch(/onPermissionRequest/)
    expect(shell).toMatch(/RESOURCE_AUDIO_CAPTURE/)
    expect(shell).toMatch(/RESOURCE_VIDEO_CAPTURE/)
  })

  it('refuses anything the page has no business asking for', () => {
    // MIDI, protected media. A request for one of those did not come from our
    // own code, and passing it through would grant on trust.
    const body = shell.slice(shell.indexOf('public void onPermissionRequest'))
    expect(body.slice(0, body.indexOf('\n        }'))).toMatch(/request\.deny\(\)/)
  })

  it('asks for the microphone directly too', () => {
    // SpeechRecognition never raises onPermissionRequest: Chromium checks the
    // app's own RECORD_AUDIO and fails with "not-allowed" without consulting
    // us, so the page has to ask through the bridge before it starts.
    expect(shell).toMatch(/void requestMic\(\)/)
    const bridge = readFileSync(
      join(ANDROID, 'java/live/walletlens/twa/WalletLensBridge.java'), 'utf8')
    expect(bridge).toMatch(/public void requestMic\(\)/)
    expect(bridge).toMatch(/public boolean micAllowed\(\)/)
  })
})
