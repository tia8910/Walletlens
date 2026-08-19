// The bug these exist for: ctx.resume() is asynchronous, so reading ctx.state
// on the next line always returns 'suspended'. The first version latched
// unlocked=false inside the very gesture meant to unlock it, and no sound ever
// played on any device. Nothing in the app surfaced that — play() just
// returned false, which is indistinguishable from "nothing to play".
import { describe, it, expect, beforeEach, vi } from 'vitest'

/** An AudioContext that resumes on a promise, the way real ones do. */
function fakeAudioContext() {
  const nodes = { started: 0 }
  return class {
    constructor() {
      this.state = 'suspended'
      this.sampleRate = 48000
      this.currentTime = 0
      this.nodes = nodes
    }
    resume() {
      // Resolves on a later tick, exactly like the platform.
      return Promise.resolve().then(() => { this.state = 'running' })
    }
    close() { this.state = 'closed'; return Promise.resolve() }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n } }
    createOscillator() { nodes.started++; return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} } }
    createBufferSource() { nodes.started++; return { buffer: null, connect: (n) => n, start() {}, stop() {} } }
    createBiquadFilter() { return { type: '', Q: { value: 1 }, frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n } }
    createBuffer() { return { getChannelData: () => new Float32Array(8) } }
  }
}

let audio

beforeEach(async () => {
  vi.resetModules()
  window.AudioContext = fakeAudioContext()
  audio = await import('./pulseAudio')
})

describe('unlock', () => {
  it('does not conclude it failed just because resume has not settled', async () => {
    audio.unlock()
    // Synchronously the context is still suspended — that is expected and must
    // not be recorded as a permanent failure.
    await Promise.resolve()
    await Promise.resolve()
    expect(audio.isUnlocked()).toBe(true)
  })
})

describe('play', () => {
  it('refuses while the context is still suspended', () => {
    audio.unlock()
    expect(audio.play('rocket')).toBe(false)
  })

  it('plays once the context is actually running', async () => {
    audio.unlock()
    await Promise.resolve()
    await Promise.resolve()
    expect(audio.play('rocket')).toBe(true)
  })

  it('does nothing before unlock is ever called', () => {
    expect(audio.play('rocket')).toBe(false)
  })

  it('rejects a sound it does not have', async () => {
    await audio.preview('nonexistent')
    expect(audio.play('nonexistent')).toBe(false)
  })
})

describe('preview', () => {
  it('waits for the resume, so a tap on Test the sound is heard', async () => {
    // The whole point of preview() over play(): it is a deliberate tap with
    // nothing else in flight, so it can afford to await the context.
    expect(await audio.preview('rocket')).toBe(true)
  })

  it('schedules the audio nodes for each voice', async () => {
    for (const voice of ['rocket', 'ath', 'milestone']) {
      expect(await audio.preview(voice)).toBe(true)
    }
  })
})
