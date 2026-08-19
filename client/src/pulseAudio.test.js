// The bug these exist for: ctx.resume() is asynchronous, so reading ctx.state
// on the next line always returns 'suspended'. The first version latched
// unlocked=false inside the very gesture meant to unlock it, and no sound ever
// played on any device. Nothing in the app surfaced that — play() just
// returned false, which is indistinguishable from "nothing to play".
//
// play() also swallows exceptions by design, so a voice that throws halfway
// through is indistinguishable from a device on silent. That is the second
// reason for the fake below: it implements every node and AudioParam method
// the synthesis actually calls, so a typo in a voice fails here instead of
// going quiet on someone's phone.
import { describe, it, expect, beforeEach, vi } from 'vitest'

/** An AudioContext that resumes on a promise, the way real ones do. */
function fakeAudioContext(log) {
  const param = (v = 0) => ({
    value: v,
    setValueAtTime(x) { this.value = x; return this },
    linearRampToValueAtTime(x) { log.ramps++; this.value = x; return this },
    exponentialRampToValueAtTime(x) {
      // The real one throws on a zero or negative target, which is exactly the
      // mistake worth catching: it is silent in production and it kills the
      // rest of the voice.
      if (!(x > 0)) throw new RangeError('exponentialRampToValueAtTime target must be positive')
      log.ramps++
      this.value = x
      return this
    },
    setTargetAtTime(x) { this.value = x; return this },
    cancelScheduledValues() { return this },
  })
  const node = (extra = {}) => ({ connect: (n) => n, disconnect() {}, ...extra })

  return class {
    constructor() {
      this.state = 'suspended'
      this.sampleRate = 48000
      this.currentTime = 0
      this.destination = node()
    }
    resume() {
      // Resolves on a later tick, exactly like the platform.
      return Promise.resolve().then(() => { this.state = 'running' })
    }
    close() { this.state = 'closed'; return Promise.resolve() }

    createGain() { return node({ gain: param(1) }) }
    createOscillator() {
      return node({
        type: '', frequency: param(440), detune: param(0),
        start() { log.sources++ }, stop() {},
      })
    }
    createBufferSource() {
      return node({ buffer: null, start() { log.sources++ }, stop() {} })
    }
    createBiquadFilter() {
      return node({ type: '', Q: param(1), frequency: param(350), gain: param(0) })
    }
    createBuffer(channels, length) {
      const data = Array.from({ length: channels }, () => new Float32Array(length))
      return { numberOfChannels: channels, length, getChannelData: (c) => data[c] }
    }
    createConvolver() { log.convolvers++; return node({ buffer: null, normalize: true }) }
    createStereoPanner() { return node({ pan: param(0) }) }
    createDynamicsCompressor() {
      log.compressors++
      return node({
        threshold: param(-24), knee: param(30), ratio: param(12),
        attack: param(0.003), release: param(0.25), reduction: 0,
      })
    }
  }
}

let audio
let log

beforeEach(async () => {
  vi.resetModules()
  log = { sources: 0, ramps: 0, convolvers: 0, compressors: 0 }
  window.AudioContext = fakeAudioContext(log)
  audio = await import('./pulseAudio')
})

const running = async () => {
  audio.unlock()
  await Promise.resolve()
  await Promise.resolve()
}

describe('unlock', () => {
  it('does not conclude it failed just because resume has not settled', async () => {
    audio.unlock()
    // Synchronously the context is still suspended — that is expected and must
    // not be recorded as a permanent failure.
    await Promise.resolve()
    await Promise.resolve()
    expect(audio.isUnlocked()).toBe(true)
  })

  it('builds the reverb and compressor bus once', async () => {
    await running()
    audio.unlock()
    audio.unlock()
    expect(log.convolvers).toBe(1)
    expect(log.compressors).toBe(1)
  })
})

describe('play', () => {
  it('refuses while the context is still suspended', () => {
    audio.unlock()
    expect(audio.play('rocket')).toBe(false)
  })

  it('plays once the context is actually running', async () => {
    await running()
    expect(audio.play('rocket')).toBe(true)
  })

  it('does nothing before unlock is ever called', () => {
    expect(audio.play('rocket')).toBe(false)
  })

  it('rejects a sound it does not have', async () => {
    await running()
    expect(audio.play('nonexistent')).toBe(false)
  })
})

describe('the voices', () => {
  // play() catches everything, so "returned true" is not enough on its own —
  // a voice that threw on its second layer also returns... false, actually,
  // but one that scheduled nothing at all would still return true. Counting
  // started sources is what distinguishes "played" from "did nothing".
  for (const [type, minSources] of [['rocket', 12], ['ath', 8], ['milestone', 8]]) {
    it(`${type} schedules a layered sound without throwing`, async () => {
      await running()
      expect(audio.play(type)).toBe(true)
      expect(log.sources).toBeGreaterThanOrEqual(minSources)
    })
  }

  it('has a duration published for every voice it can play', async () => {
    await running()
    for (const type of Object.keys(audio.DURATION_MS)) {
      expect(audio.play(type)).toBe(true)
    }
  })
})

describe('release', () => {
  it('lets audio be rebuilt afterwards', async () => {
    await running()
    audio.release()
    expect(audio.isUnlocked()).toBe(false)
    expect(audio.play('ath')).toBe(false)

    await running()
    expect(audio.play('ath')).toBe(true)
  })
})
