import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAlarmPrefs, setAlarmPrefs, deliverAlarm, dismissNative, subscribeAlarms, _resetAlarms } from './alarm'
import { alarmTone } from './alertRules'
import { buildPayload } from '../../push-api/notify-logic.js'

// The alarm: on or off, with sound or without, the WalletLens sound, and the
// native alarm in the Android app.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(join(here, p), 'utf8')
const ANDROID = '../../walletlens_source/release_package/app/src/main/'

describe('alarm settings', () => {
  beforeEach(() => { localStorage.clear(); _resetAlarms(); delete window.AndroidBridge })
  afterEach(() => { delete window.AndroidBridge })

  it('are on by default, and the user can turn them off', () => {
    expect(getAlarmPrefs()).toEqual({ fullscreen: true, sound: true })
    setAlarmPrefs({ sound: false })
    expect(getAlarmPrefs()).toEqual({ fullscreen: true, sound: false })
    setAlarmPrefs({ fullscreen: false })
    expect(getAlarmPrefs()).toEqual({ fullscreen: false, sound: false })
  })

  it('reach the Android app, for alarms that arrive while it is closed', () => {
    const setPrefs = vi.fn()
    window.AndroidBridge = { showAlarm: vi.fn(), setAlarmPrefs: setPrefs }
    setAlarmPrefs({ fullscreen: false })
    expect(setPrefs).toHaveBeenLastCalledWith(false, true)
  })

  it('off: no alarm at all, the caller shows a plain notification', () => {
    setAlarmPrefs({ fullscreen: false })
    const shown = []
    subscribeAlarms(a => shown.push(a))
    expect(deliverAlarm({ id: 'x', title: 'T' })).toBe('off')
    expect(shown).toEqual([null])
  })

  it('on the web: the full-screen card, with or without sound', () => {
    const shown = []
    subscribeAlarms(a => a && shown.push(a))
    setAlarmPrefs({ sound: false })
    expect(deliverAlarm({ id: 'x', title: 'T', tone: 'up' })).toBe('page')
    expect(shown[0]).toMatchObject({ native: false, sound: false, tone: 'up' })
  })

  it('in the Android app: the native alarm rings, the card stays quiet, and dismissing it takes both down', () => {
    const showAlarm = vi.fn(() => true), dismissAlarm = vi.fn()
    window.AndroidBridge = { showAlarm, dismissAlarm }
    const shown = []
    subscribeAlarms(a => a && shown.push(a))
    expect(deliverAlarm({ id: 'price:7', title: 'Hit target BTC', body: 'b', tone: 'down', url: '/asset/bitcoin' })).toBe('native')
    expect(showAlarm).toHaveBeenCalledWith('Hit target BTC', 'b', 'down', '/asset/bitcoin', 'price:7')
    expect(shown[0].native).toBe(true)
    dismissNative(shown[0])
    expect(dismissAlarm).toHaveBeenCalledWith('price:7')
  })
})

describe('the alarm sound', () => {
  it('rises for good news, falls for bad', () => {
    expect(alarmTone({ type: 'price', condition: 'above' })).toBe('up')
    expect(alarmTone({ type: 'price', condition: 'below' })).toBe('down')
    expect(['buy', 'golden', 'rsi_low', 'sell', 'death', 'rsi_high'].map(e => alarmTone({ type: 'signal', event: e }))).toEqual(['up', 'up', 'up', 'down', 'down', 'down'])
    expect(['value_above', 'pnl_above', 'value_below', 'pnl_below', 'weight_above'].map(k => alarmTone({ type: 'goal', kind: k }))).toEqual(['up', 'up', 'down', 'down', 'neutral'])
  })

  it('is the same WalletLens recording on the web and on Android', () => {
    for (const t of ['up', 'down', 'neutral']) {
      expect(statSync(join(here, `../public/sounds/alarm-${t}.mp3`)).size).toBeGreaterThan(5000)
      expect(statSync(join(here, `${ANDROID}res/raw/wl_alarm_${t}.ogg`)).size).toBeGreaterThan(5000)
    }
    expect(read('alarm.js')).toMatch(/new Audio\(`\/sounds\/alarm-\$\{t\}\.mp3`\)/)
  })
})

describe('the native Android alarm', () => {
  const helper = read(`${ANDROID}java/live/walletlens/twa/NotificationHelper.java`)
  const bridge = read(`${ANDROID}java/live/walletlens/twa/WalletLensBridge.java`)
  const fcm = read(`${ANDROID}java/live/walletlens/twa/WalletLensMessagingService.java`)
  const manifest = read(`${ANDROID}AndroidManifest.xml`)

  it('rings the app sound on its own channels and keeps ringing until acted on', () => {
    for (const t of ['up', 'down', 'neutral']) expect(helper).toContain(`R.raw.wl_alarm_${t}`)
    expect(helper).toMatch(/n\.flags \|= Notification\.FLAG_INSISTENT/)
    expect(helper).toMatch(/setTimeoutAfter\(ALARM_TIMEOUT_MS\)/)
    expect(helper).toMatch(/"Snooze 10 min"/)
    expect(helper).toMatch(/"Dismiss"/)
    expect(helper).toContain('CHANNEL_ALARM_SILENT_ID')
  })

  it('stays within Play policy: no alarm-clock category, no full-screen intent, no exact alarms', () => {
    expect(helper).not.toMatch(/setCategory\(NotificationCompat\.CATEGORY_ALARM\)/)
    expect(helper).not.toMatch(/setFullScreenIntent/)
    expect(manifest).not.toMatch(/<uses-permission[^>]*(USE_FULL_SCREEN_INTENT|SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM)/)
    expect(manifest).toMatch(/android:name="\.AlarmActionReceiver"\s+android:exported="false"/)
  })

  it('is reachable from the page and follows the user\'s settings for pushes', () => {
    expect(bridge).toMatch(/@JavascriptInterface\s+public boolean showAlarm\(String title, String body, String tone, String url, String tag\)/)
    expect(bridge).toMatch(/@JavascriptInterface\s+public void dismissAlarm\(String tag\)/)
    expect(bridge).toMatch(/@JavascriptInterface\s+public void setAlarmPrefs\(boolean enabled, boolean sound\)/)
    // Price targets and chart signals ring as alarms.
    expect(fcm).toMatch(/\("target"\.equals\(channel\) \|\| "signal"\.equals\(channel\)\) && NotificationHelper\.alarmEnabled\(this\)/)
    expect(fcm).toMatch(/data\.get\("dir"\)/)
  })

  it('gets the direction of a price alert from the server', () => {
    expect(buildPayload({ channel: 'target', title: 't', body: 'b', dir: 'down' }).dir).toBe('down')
    expect(buildPayload({ channel: 'target', title: 't', body: 'b', dir: 'sideways' }).dir).toBeUndefined()
    expect(read('../../workers/push/jobs.js')).toMatch(/dir: a\.condition === "above" \? "up" : "down"/)
  })
})
