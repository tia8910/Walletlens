import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playEffectSound, resetEffectAudio, LATEST_START_MS } from './screenEffectsAudio'
import { EXPLODE } from './screenEffects'

// The explode's sound used to land after its animation: the burst fires on
// opening the app, before any tap, so the sound waited for the next tap and
// then played from the top. These check that a late sound starts partway in,
// in step with the picture, and that one past the picture's impact is dropped.

let contexts
class FakeParam {
  constructor() { this.value = 0 }
  setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {}
}
class FakeNode {
  constructor(ctx) { this.ctx = ctx; this.gain = new FakeParam(); this.frequency = new FakeParam(); this.Q = new FakeParam(); this.detune = new FakeParam(); this.pan = new FakeParam()
    this.threshold = new FakeParam(); this.knee = new FakeParam(); this.ratio = new FakeParam(); this.attack = new FakeParam(); this.release = new FakeParam() }
  connect(n) { return n } start(at) { this.ctx.starts.push(at) } stop() {}
}
class FakeContext {
  constructor() {
    this.state = 'suspended'; this.currentTime = 10; this.sampleRate = 8000; this.starts = []; this.destination = {}
    contexts.push(this)
  }
  resume() { return new Promise(r => { this._resolve = r }) }
  allow() { this.state = 'running'; this._resolve?.() }
  close() {}
  createGain() { return new FakeNode(this) }
  createOscillator() { return new FakeNode(this) }
  createBiquadFilter() { return new FakeNode(this) }
  createDynamicsCompressor() { return new FakeNode(this) }
  createStereoPanner() { return new FakeNode(this) }
  createConvolver() { return new FakeNode(this) }
  createBufferSource() { return new FakeNode(this) }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) } }
}

beforeEach(() => {
  contexts = []
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] })
  vi.setSystemTime(100000)
  window.AudioContext = FakeContext
})
afterEach(() => { resetEffectAudio(); vi.useRealTimers(); delete window.AudioContext })

const flushPromises = () => new Promise(r => queueMicrotask(r))
const tap = () => document.dispatchEvent(new Event('pointerdown'))

describe('the explode sound keeps to the animation', () => {
  it('plays at once when audio is already running', () => {
    window.AudioContext = class extends FakeContext { constructor() { super(); this.state = 'running' } }
    expect(playEffectSound(EXPLODE, Date.now())).toBe(true)
    expect(Math.min(...contexts[0].starts)).toBeCloseTo(10.02, 5)
  })

  it('starts partway in when a tap unlocks it during the animation', async () => {
    const startedAt = Date.now()
    expect(playEffectSound(EXPLODE, startedAt)).toBe(false)
    const ctx = contexts[0]
    vi.setSystemTime(startedAt + 400)
    ctx.state = 'running'   // the tap's resume
    tap()
    await flushPromises()
    expect(ctx.starts.length).toBeGreaterThan(0)
    // Scheduled 0.4 s in the past, so the impact still lands at 1.15 s.
    expect(Math.min(...ctx.starts)).toBeCloseTo(10.02 - 0.4, 5)
  })

  it('plays when the browser lets the context run without a tap', async () => {
    const startedAt = Date.now()
    playEffectSound(EXPLODE, startedAt)
    vi.setSystemTime(startedAt + 100)
    contexts[0].allow()
    await flushPromises()
    expect(contexts[0].starts.length).toBeGreaterThan(0)
  })

  it('is dropped, not played late, once the animation is past its impact', async () => {
    const startedAt = Date.now()
    playEffectSound(EXPLODE, startedAt)
    const ctx = contexts[0]
    vi.setSystemTime(startedAt + LATEST_START_MS[EXPLODE] + 200)
    ctx.state = 'running'
    tap()
    ctx._resolve?.()
    await flushPromises()
    expect(ctx.starts).toHaveLength(0)
  })
})
