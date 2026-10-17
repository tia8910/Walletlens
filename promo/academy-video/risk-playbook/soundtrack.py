# Builds soundtrack3_<lang>.wav for the 5-minute Risk Playbook film, entirely from the cues the renderer
# logged (frames*-events.json): scene starts with their music style, narration lines with their slot,
# and sound effects (pings, typing, splash, chomp, bonk, applause, ...). Everything is synthesised or
# generated locally (Kokoro TTS for English narration), so nothing needs a licence.
#   python3 soundtrack3.py <voice|none|recordings-folder> <events.json> <en|ar>
import json, os, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'am_michael'
EVENTS = sys.argv[2] if len(sys.argv) > 2 else 'events.json'
LANG = sys.argv[3] if len(sys.argv) > 3 else 'en'
SR = 48000
ev = json.load(open(EVENTS))
scenes = [(e[0], e[2], e[3], e[4]) for e in ev if e[1] == 'scene']
TOTAL = scenes[-1][0] + scenes[-1][2]
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(5)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2)); vo = np.zeros((N, 2))

def tt(d): return np.arange(int(d * SR)) / SR
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def filt(x, kind, f): return sosfilt(butter(2, f, kind, fs=SR, output='sos'), x, axis=0)
def env(n, a, r):
    e = np.ones(n); A = min(n, int(a * SR)); R = min(n - A, int(r * SR))
    if A: e[:A] = np.linspace(0, 1, A)
    if R: e[n - R:] = np.linspace(1, 0, R)
    return e
def put(buf, t0, sig, gain=1.0, pan=0.0):
    i = int(max(0, t0) * SR)
    if i >= N: return
    sig = sig[: N - i]
    if sig.ndim == 1: sig = np.stack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)], 1) * 1.414
    buf[i:i + len(sig)] += sig * gain
def noise(d): return rng.standard_normal(int(d * SR))
def sweep_bp(x, f0, f1, q=1.6):
    out = np.zeros(len(x)); seg = int(SR * 0.015)
    for i in range(0, len(x), seg):
        fc = f0 * (f1 / f0) ** (i / max(1, len(x)))
        out[i:i + seg] = filt(x[i:i + seg], 'band', [max(40, fc / q), min(SR / 2 - 100, fc * q)])
    return out
IR = noise(1.6) * np.exp(-np.linspace(0, 6, int(1.6 * SR))); IR = filt(IR, 'low', 6000); IR /= np.sqrt(np.sum(IR ** 2))
def verb(x, wet=0.25): return x + wet * fftconvolve(x, IR)[: len(x)]

# ── instruments ──
def kick(p=1.0):
    t = tt(0.45); f = 42 + 130 * np.exp(-t * 32)
    return np.tanh((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) + filt(noise(0.45), 'high', 3000) * np.exp(-t * 300) * 0.4) * 1.8 * p)
def snare():
    t = tt(0.3); return verb(np.tanh((np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * .6 + filt(noise(0.3), 'band', [1500, 8000]) * np.exp(-t * 16)) * 1.5), .18)
def clap():
    t = tt(0.25); n = filt(noise(0.25), 'band', [900, 3500]); e = np.zeros(len(t))
    for d in (0, 0.009, 0.018): e += np.exp(-np.maximum(0, t - d) * 35) * (t >= d)
    return verb(n * e * 0.6, 0.3)
def hat(d=0.05): t = tt(d); return filt(noise(d), 'high', 8000) * np.exp(-t * (6 / d)) * 0.45
def b808(n, d):
    t = tt(d); return np.tanh(2.2 * np.sin(2 * np.pi * midi(n) * t)) * np.exp(-t * 1.4) * env(len(t), 0.004, 0.06)
def saw(notes, d, cutoff=2200):
    t = tt(d); x = np.zeros(len(t))
    for n in notes:
        for dd in (-0.15, -0.05, 0.05, 0.15): x += 2 * ((t * midi(n) * 2 ** (dd / 12) + rng.random()) % 1) - 1
    return filt(x / (len(notes) * 4), 'low', cutoff) * env(len(t), 0.25, 0.5)
def bell(n, d=1.2):
    t = tt(d); f = midi(n)
    return verb(sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dc) for m, a, dc in ((1, 1, 3), (2.76, .5, 5), (5.4, .25, 8))) * env(len(t), 0.002, 0.1), 0.3)
def impact(s=1.0):
    t = tt(3.0); f = 28 + 90 * np.exp(-t * 5)
    return verb((np.tanh(2.5 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t * 1.3) + filt(noise(3.0), 'low', 2500) * np.exp(-t * 6) * .7) * s, 0.4)
def braam(d=4.0):
    t = tt(d); x = np.zeros(len(t))
    for n in (33, 40, 45):
        for dd in (-0.2, 0, 0.2): x += 2 * ((t * midi(n) * 2 ** (dd / 12)) % 1) - 1
    return np.tanh(filt(x, 'low', 700) / 4) * np.exp(-t * 0.5) * env(len(t), 0.02, 1.0)
def riser(d): return sweep_bp(noise(d), 200, 7000) * np.linspace(0, 1, int(d * SR)) ** 2
def rev_cym(d=1.0): return filt(noise(d), 'high', 5000) * np.linspace(0, 1, int(d * SR)) ** 3

Am, F, C, G, Dm, E = [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [50, 53, 57], [52, 56, 59]
def section(t0, d, chords, bpm, style, cutoff=2400, g=1.0):
    beat = 60 / bpm; bar = 4 * beat
    for b in range(int(np.ceil(d / bar))):
        c = chords[b % len(chords)]; bt = t0 + b * bar
        if bt >= t0 + d: break
        L = min(bar, t0 + d - bt); put(music, bt, saw([n + 12 for n in c], L + .3, cutoff), .15 * g)
        for q in range(4):
            ts = bt + q * beat
            if ts >= t0 + d: break
            if style in ('trap', 'drive'):
                if q == 0 or style == 'drive': put(music, ts, kick(), .5 * g)
                if style == 'drive' and q in (1, 3): put(music, ts, clap(), .34 * g)
                if style == 'trap' and q == 2: put(music, ts, snare(), .4 * g); put(music, ts, clap(), .22 * g)
                for h in range(4 if (style == 'trap' and q == 3 and b % 2) else 2): put(music, ts + h * beat / (4 if (style == 'trap' and q == 3 and b % 2) else 2), hat(), .15 * g, .3)
                if q == 0: put(music, ts, b808(c[0] - 24, beat * 1.9), .42 * g)
            if style in ('soft', 'gold'):
                if style == 'soft' and q % 2 == 0: put(music, ts, kick(.7), .3 * g)
                if style == 'soft': put(music, ts + beat / 2, hat(.04), .08 * g, .3)
                if q == 0: put(music, ts, b808(c[0] - 24, bar * .9), .26 * g)
                put(music, ts, bell(c[q % 3] + 24, .9), (.07 if style == 'soft' else .09) * g, -.4 + .8 * (q % 2))
            if style == 'dark':
                if q % 2 == 0: put(music, ts, b808(c[0] - 24, beat * 1.8), .4 * g)
                put(music, ts + beat / 2, hat(.03), .05 * g)
def score(t0, d, style):
    if style == 'tense':
        put(music, t0, saw([45, 52, 57, 60], d + .3, 700), .2)
        for i in range(int(d / .8)): put(music, t0 + .4 + i * .8, kick(.9), .38); put(music, t0 + .6 + i * .8, kick(.6), .22)
        put(music, t0 + d - 1.0, riser(1.0), .18)
    elif style == 'trap': section(t0, d, [C, G, Am, F], 140, 'trap', 3400); put(music, t0, impact(.7), .35)
    elif style == 'soft': section(t0, d, [F, C, G, Am], 92, 'soft', 1700)
    elif style == 'drive': section(t0, d, [F, G, C, Am], 120, 'drive', 3600)
    elif style == 'dark': section(t0, d, [Dm, Am, Dm, E], 84, 'dark', 900); put(music, t0, saw([38, 45, 50], d, 500), .18)
    elif style == 'gold': section(t0, d, [C, F, Am, G], 80, 'gold', 2600, .9)
    elif style == 'crash':
        put(music, t0, impact(1.4), 1.0); put(music, t0, braam(6.0), .55)
        for i in range(4): put(music, t0 + .4 + i * .7, kick(1.2), .45)
        section(t0 + 6.5, d - 6.5, [Am, F, Dm, E], 84, 'dark', 900, .8)
    elif style == 'outro':
        put(music, t0 + .15, impact(.55), .32); put(music, t0 + .15, saw([48, 55, 60, 64, 67, 72], d - .2, 2800), .2); put(music, t0 + .15, b808(36, 4), .28)
for t0, key, d, style in scenes:
    if style != 'none': score(t0, d, style)
    put(music, t0 - .8, rev_cym(.8), .22)

# ── sound effects ──
def tone(f, d, dec=6, tri=False):
    t = tt(d); w = (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * f * t)) if tri else np.sin(2 * np.pi * f * t)
    return w * np.exp(-t * dec) * env(len(t), 0.004, 0.05)
def whoosh(): t = tt(.6); return sweep_bp(noise(.6), 250, 4000, 1.4) * np.sin(np.pi * t / t[-1]) ** 2 * .5
def ping(): out = np.zeros(int(1.2 * SR)); [out.__setitem__(slice(int(i * .16 * SR), int(i * .16 * SR) + int(.5 * SR)), out[int(i * .16 * SR):int(i * .16 * SR) + int(.5 * SR)] + tone(f, .5, 7)) for i, f in enumerate((1318, 1760, 1318))]; return verb(out, .2)
def typing(d=2.4):
    out = np.zeros(int(d * SR)); i = 0
    while i < len(out) - 2000:
        c = filt(noise(.03), 'band', [1800, 6000]) * np.exp(-tt(.03) * 160) * rng.uniform(.4, 1); out[i:i + len(c)] += c; i += int(rng.uniform(.07, .16) * SR)
    return out
def buzz():
    t = tt(1.3); x = filt(np.sign(np.sin(2 * np.pi * 160 * t)), 'low', 900); g = ((t % .43) < .3).astype(float); return x * g * .6
def ka_ching(): return np.concatenate([filt(noise(.06), 'band', [2000, 6000]) * np.exp(-tt(.06) * 60), np.zeros(int(.05 * SR)), bell(88, 1.4) + bell(93, 1.4) * .7])
def splash(): t = tt(1.4); return verb(filt(noise(1.4), 'band', [300, 4000]) * np.exp(-t * 3) * env(len(t), .02, .4), .4)
def chomp(): t = tt(.5); return np.tanh(3 * (filt(noise(.5), 'band', [200, 1800]) * np.exp(-t * 14) + np.sin(2 * np.pi * (90 + 60 * np.exp(-t * 20)) * t) * np.exp(-t * 9)))
def snore(d=3.0):
    t = tt(d); inh = filt(noise(d), 'band', [150, 900]) * (np.sin(2 * np.pi * t / 1.5) > 0) * (.5 + .5 * np.sin(2 * np.pi * 38 * t)); return inh * env(len(t), .2, .4) * .7
def bonk(): t = tt(.6); return np.sin(2 * np.pi * (520 * np.exp(-t * 3)) * t) * np.exp(-t * 6) + filt(noise(.6), 'band', [400, 1200]) * np.exp(-t * 30) * .8
def brick_click(): t = tt(.06); return filt(noise(.06), 'band', [1500, 5000]) * np.exp(-t * 120) + np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 90) * .5
def applause(d=4.0):
    out = np.zeros(int(d * SR))
    for _ in range(int(d * 90)):
        c = clap() * rng.uniform(.2, .6); i = int(rng.uniform(0, d - .3) * SR); out[i:i + len(c)] += c[: len(out) - i]
    return filt(out, 'high', 500) * env(len(out), .3, 1.2)
def scratch():
    t = tt(.55); f = 300 + 900 * np.abs(np.sin(2 * np.pi * 3.2 * t)); return (np.sin(2 * np.pi * np.cumsum(f) / SR) * .4 + sweep_bp(noise(.55), 600, 2500) * .6) * env(len(t), .005, .1)
def rewind(d=1.0):
    t = tt(d); out = np.zeros(len(t))
    for k in range(7): out += np.sin(2 * np.pi * np.cumsum(rng.uniform(1500, 3200) * (.35 ** (t / d)) * (1 + .3 * np.sin(2 * np.pi * 40 * t))) / SR) * np.exp(-((t - k * d / 7) % (d / 7)) * 18) * .25
    return filt(out + sweep_bp(noise(d), 4000, 600) * .5, 'band', [300, 6000]) * env(len(t), .02, .1)
def slowmo(d=2.4): t = tt(d); return verb(np.tanh(2 * np.sin(2 * np.pi * np.cumsum(160 * (.25 ** (t / d))) / SR)) * env(len(t), .01, .6), .5)
def alarm():
    out = np.zeros(int(1.6 * SR))
    for i in range(4):
        t = tt(.32); s2 = filt(2 * ((np.cumsum(640 - 220 * t / .32) / SR) % 1) - 1, 'low', 2500) * env(len(t), .02, .08); j = int(i * .36 * SR); out[j:j + len(s2)] += s2
    return out
FX = {'whoosh': (whoosh, .45, -.12), 'ping': (ping, .35, 0), 'typing': (typing, .3, 0), 'buzz': (buzz, .45, 0), 'cash': (ka_ching, .35, 0),
      'splash': (splash, .5, 0), 'chomp': (chomp, .6, 0), 'snore': (snore, .35, 0), 'bonk': (bonk, .55, 0), 'pop': (brick_click, .4, 0),
      'applause': (applause, .5, 0), 'scratch': (scratch, .55, -.05), 'rewind': (rewind, .45, 0), 'slowmo': (slowmo, .5, 0), 'alarm': (alarm, .14, 0)}
for e in ev:
    k = e[1]
    if k == 'ding': put(sfx, e[0], verb(tone(988, .7, 4, True), .3), .28); put(sfx, e[0] + .1, verb(tone(1480, .9, 4, True), .3), .24)
    elif k in FX: fn, g, off = FX[k]; put(sfx, e[0] + off, fn(), g)
# the freeze frame: music stops dead between the record scratch and the rewind
sc = [e[0] for e in ev if e[1] == 'scratch']; rw = [e[0] for e in ev if e[1] == 'rewind']
if sc and rw:
    a, b = int(sc[0] * SR), int(rw[0] * SR); f = int(.03 * SR); music[a:a + f] *= np.linspace(1, 0, f)[:, None]; music[a + f:b] = 0

# ── narration ──
lines = [(e[0], e[2], e[3]) for e in ev if e[1] == 'vo']
if VOICE != 'none':
    if os.path.isdir(VOICE):
        for i, (t0, text, room) in enumerate(lines):
            p = os.path.join(VOICE, f'{i + 1:02d}.wav')
            if not os.path.exists(p): continue
            w = wave.open(p); sr = w.getframerate(); ch = w.getnchannels(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
            a = a.reshape(-1, ch).mean(1) if ch > 1 else a; a = filt(resample_poly(a, SR, sr), 'high', 90); put(vo, t0, verb(a / (np.abs(a).max() + 1e-9) * .9, .06), 1.0)
    else:
        from vo import Voice
        k = Voice(os.path.join(HERE, 'tts', 'model_q8.onnx'), os.path.join(HERE, 'tts', 'voices.npz'))
        for t0, text, room in lines:
            speed = 1.05; a, sr = k.create(text, voice=VOICE, speed=speed, lang='en-us')
            if len(a) / sr > room: speed = min(1.3, speed * (len(a) / sr) / max(.5, room)); a, sr = k.create(text, voice=VOICE, speed=speed, lang='en-us')
            a = filt(resample_poly(a, SR, sr), 'high', 90); put(vo, t0, verb(a / (np.abs(a).max() + 1e-9) * .9, .06), 1.0)
            print(f'  VO @{t0:6.1f}s {len(a)/SR:4.1f}s/{room:4.1f}s x{speed:.2f}  {text[:48]}')

# ── mix ──
ve = np.abs(vo[:, 0]) + 1e-12; win = int(.12 * SR); ve = np.convolve(ve, np.ones(win) / win, 'same'); ve = ve / (ve.max() + 1e-9)
d = np.clip(ve * 4, 0, 1)
mix = music * (1 - .55 * d)[:, None] * .8 + sfx * (1 - .25 * d)[:, None] + vo * 1.05
mix = mix[: int(TOTAL * SR)]; fade = int(2 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = mix / (np.percentile(np.abs(mix), 99.9) + 1e-9) * .7; mix = np.tanh(mix * 1.3) / np.tanh(1.3) * .92
with wave.open(os.path.join(HERE, f'soundtrack_{LANG}.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print(f'soundtrack_{LANG}.wav {TOTAL:.1f}s · {len(scenes)} scenes · {len(lines)} lines · voice {VOICE}')
