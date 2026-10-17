# Builds soundtrack.wav for the Risk Playbook video:
#   narration (Kokoro TTS, one line per scene, fitted to the scene length)
#   + a punchy music bed (808 drums/bass, builds, a heavy hit on the crash) that ducks under the voice
#   + story sound effects (phone buzz, record scratch, party horn, crowd, power-up, slide whistle,
#     cash register, applause, chalk, logo shimmer) and the UI sounds the renderer logged in events.json.
# Everything is synthesised or generated locally, so there is nothing to license.
#   python3 soundtrack.py [voice]      voice: af_heart (default) | am_michael | ...
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

import os
TTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tts')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SR = 48000
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'af_heart'
SCENES = [('hook', 8.5), ('party', 7), ('ollie', 7), ('lev', 7.5), ('plan', 7.5), ('end', 8), ('cta', 6.5), ('outro', 8)]
TOTAL = sum(d for _, d in SCENES)
N = int(TOTAL * SR)
S = {}; acc = 0
for k, d in SCENES: S[k] = acc; acc += d
rng = np.random.default_rng(11)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2)); vo = np.zeros((N, 2))

# ── helpers ──
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
    if sig.ndim == 1:
        sig = np.stack([sig * np.cos((pan + 1) * np.pi / 4), sig * np.sin((pan + 1) * np.pi / 4)], 1) * 1.414
    buf[i:i + len(sig)] += sig * gain
def noise(d): return rng.standard_normal(int(d * SR))
def sweep_bp(x, f0, f1, q=1.6):
    out = np.zeros(len(x)); seg = int(SR * 0.015)
    for i in range(0, len(x), seg):
        fc = f0 * (f1 / f0) ** (i / len(x))
        out[i:i + seg] = filt(x[i:i + seg], 'band', [max(40, fc / q), min(SR / 2 - 100, fc * q)])
    return out
IR = noise(1.6) * np.exp(-np.linspace(0, 6, int(1.6 * SR))); IR = filt(IR, 'low', 6000); IR /= np.sqrt(np.sum(IR ** 2))
def verb(x, wet=0.25):
    return x + wet * fftconvolve(x, IR)[: len(x)] if x.ndim == 1 else x

# ── drums & instruments ──
def kick(punch=1.0):
    t = tt(0.45); f = 42 + 130 * np.exp(-t * 32)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    click = filt(noise(0.45), 'high', 3000) * np.exp(-t * 300) * 0.4
    return np.tanh((body + click) * 1.8 * punch)
def snare():
    t = tt(0.3); tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    n = filt(noise(0.3), 'band', [1500, 8000]) * np.exp(-t * 16)
    return verb(np.tanh((tone * 0.6 + n) * 1.5), 0.18)
def clap():
    t = tt(0.25); n = filt(noise(0.25), 'band', [900, 3500]); e = np.zeros(len(t))
    for d in (0, 0.009, 0.018): e += np.exp(-np.maximum(0, t - d) * 35) * (t >= d)
    return verb(n * e * 0.6, 0.3)
def hat(d=0.05): t = tt(d); return filt(noise(d), 'high', 8000) * np.exp(-t * (6 / d)) * 0.45
def b808(n, d, glide_from=None):
    t = tt(d); f = np.full(len(t), midi(n))
    if glide_from: f = midi(n) + (midi(glide_from) - midi(n)) * np.exp(-t * 18)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return np.tanh(2.2 * x) * np.exp(-t * 1.4) * env(len(t), 0.004, 0.06)
def supersaw(notes, d, cutoff=2200, det=(-0.15, -0.05, 0.05, 0.15)):
    t = tt(d); x = np.zeros(len(t))
    for n in notes:
        for dd in det: x += 2 * ((t * midi(n) * 2 ** (dd / 12) + rng.random()) % 1) - 1
    x = filt(x / (len(notes) * len(det)), 'low', cutoff)
    return x * env(len(t), 0.25, 0.5)
def bell(n, d=1.2):
    t = tt(d); f = midi(n)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dc) for m, a, dc in ((1, 1, 3), (2.76, .5, 5), (5.4, .25, 8), (8.93, .12, 12)))
    return verb(x * env(len(t), 0.002, 0.1), 0.3)
def impact(size=1.0):
    t = tt(3.0); f = 28 + 90 * np.exp(-t * 5)
    sub = np.tanh(2.5 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t * 1.3)
    crack = filt(noise(3.0), 'low', 2500) * np.exp(-t * 6)
    return verb((sub + crack * 0.7) * size, 0.4)
def braam(d=4.0):
    t = tt(d); x = np.zeros(len(t))
    for n in (33, 40, 45):
        for dd in (-0.2, 0, 0.2): x += 2 * ((t * midi(n) * 2 ** (dd / 12)) % 1) - 1
    cut = 300 + 1600 * np.exp(-t * 1.5)
    out = np.zeros(len(t)); seg = int(SR * 0.02)
    for i in range(0, len(t), seg): out[i:i + seg] = filt(x[i:i + seg], 'low', cut[i])
    return np.tanh(out / 4) * np.exp(-t * 0.5) * env(len(t), 0.02, 1.0)
def riser(d): return sweep_bp(noise(d), 200, 7000) * np.linspace(0, 1, int(d * SR)) ** 2
def reverse_cymbal(d=1.2): x = filt(noise(d), 'high', 5000) * np.linspace(0, 1, int(d * SR)) ** 3; return x

def section(key, chords, bpm, style, cutoff=2400, gain=1.0, start_off=0.0, end_off=0.0):
    t0 = S[key] + start_off; d = dict(SCENES)[key] - start_off - end_off
    beat = 60 / bpm; bar = 4 * beat; nb = int(np.ceil(d / bar))
    for b in range(nb):
        c = chords[b % len(chords)]; bt = t0 + b * bar
        if bt >= t0 + d: break
        L = min(bar, t0 + d - bt)
        put(music, bt, supersaw([n + 12 for n in c], L + 0.3, cutoff), 0.16 * gain, 0)
        for q in range(4):
            ts = bt + q * beat
            if ts >= t0 + d: break
            if style in ('trap', 'drive'):
                if q == 0 or (style == 'drive'): put(music, ts, kick(), 0.55 * gain)
                if q in (1, 3) and style == 'drive': put(music, ts, clap(), 0.38 * gain, -0.05)
                if q == 2 and style == 'trap': put(music, ts, snare(), 0.42 * gain); put(music, ts, clap(), 0.25 * gain)
                if q == 3 and style == 'trap' and b % 2 == 1: put(music, ts + beat / 2, kick(.8), 0.4 * gain)
                nh = 4 if (style == 'trap' and q == 3 and b % 2 == 1) else 2
                for h in range(nh): put(music, ts + h * beat / nh, hat(), 0.16 * gain, 0.35 if h % 2 else -0.2)
                if q == 0: put(music, ts, b808(c[0] - 24, beat * 1.9, c[0] - 12 if b % 2 else None), 0.45 * gain)
                if q == 2 and style == 'drive': put(music, ts, b808(c[0] - 24, beat * 1.9), 0.4 * gain)
            if style == 'soft':
                if q % 2 == 0: put(music, ts, kick(.7), 0.35 * gain)
                put(music, ts + beat / 2, hat(.04), 0.1 * gain, 0.3)
                if q == 0: put(music, ts, b808(c[0] - 24, bar * 0.9), 0.32 * gain)
            if style in ('soft', 'drive'):
                put(music, ts, bell(c[q % 3] + 24, 0.9), 0.07 * gain, -0.4 + 0.8 * (q % 2))

Am, F, C, G, Dm, E = [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [50, 53, 57], [52, 56, 59]

# ── music ──
# hook: dark drone + heartbeat, impact on frame 1
put(music, 0, supersaw([45, 52, 57, 60], S['party'] + .3, 700), 0.22)
put(music, 0.0, impact(1.0), 0.55)
for i in range(int(8.0 / 0.8)):
    put(music, 0.5 + i * 0.8, kick(.9), 0.42); put(music, 0.5 + i * 0.8 + 0.2, kick(.6), 0.26)
put(music, S['party'] - 1.2, reverse_cymbal(1.2), 0.35)
# party: bright trap with a drop on the time jump
section('party', [C, G, Am, F], 140, 'trap', 3600)
# ollie: chill
section('ollie', [F, C, G, Am], 90, 'soft', 1700)
# lev: build, crash
lv = S['lev']
put(music, lv, supersaw([50, 57, 62], 2.6, 1400), 0.18)
for i in range(16): put(music, lv + i * 0.16, snare(), 0.10 + i * 0.016)
put(music, lv + 0.3, riser(2.25), 0.35)
put(music, lv + 2.55, impact(1.3), 0.95); put(music, lv + 2.55, braam(4.6), 0.55)
for i in range(6): put(music, lv + 2.55 + i * 0.75, kick(1.1), 0.35)
# plan: rebuild
section('plan', [Am, F, C, G], 96, 'soft', 1900, gain=.95)
put(music, S['end'] - 1.0, reverse_cymbal(1.0), 0.35)
# end: uplifting drive
put(music, S['end'], impact(.7), 0.4)
section('end', [F, G, C, Am], 120, 'drive', 3800)
section('cta', [C, G, F, C], 120, 'soft', 2600, gain=.85)
put(music, S['outro'] - 0.8, reverse_cymbal(.8), 0.3)
# outro: warm chord under the logo
o = S['outro']
put(music, o + 0.15, impact(.55), 0.35)
put(music, o + 0.15, supersaw([48, 55, 60, 64, 67, 72], 7.6, 2800), 0.22)
put(music, o + 0.15, b808(36, 4), 0.3)

# ── story sound effects ──
def phone_buzz():
    t = tt(0.32); x = np.sign(np.sin(2 * np.pi * 160 * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * t))
    return filt(x, 'low', 900) * env(len(t), 0.01, 0.04)
def record_scratch():
    t = tt(0.55); f = 300 + 900 * np.abs(np.sin(2 * np.pi * 3.2 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + sweep_bp(noise(0.55), 600, 2500) * 0.6
    return x * env(len(t), 0.005, 0.1)
def party_horn():
    t = tt(0.7); f = 380 + 220 * np.minimum(1, t / 0.12)
    x = 2 * ((np.cumsum(f) / SR) % 1) - 1; x = filt(x, 'band', [500, 3500])
    return x * (1 + 0.3 * np.sin(2 * np.pi * 30 * t)) * env(len(t), 0.02, 0.15)
def crowd(d=3.0, cheer=True):
    t = tt(d); out = np.zeros(len(t))
    for v in range(14):
        f0 = rng.uniform(180, 420); vib = np.sin(2 * np.pi * rng.uniform(3, 7) * t + rng.random() * 6)
        voice = sweep_bp(noise(d), f0 * 2.2, f0 * 3.2, 1.3) * (0.5 + 0.5 * vib)
        out += voice * env(len(t), rng.uniform(.05, .4), rng.uniform(.4, 1.2))
    out = filt(out, 'band', [250, 4500])
    return verb(out / 6 * env(len(t), 0.15, 1.0), 0.35)
def applause(d=4.0, density=90):
    out = np.zeros(int(d * SR))
    for _ in range(int(d * density)):
        c = clap() * rng.uniform(.2, .6); i = int(rng.uniform(0, d - 0.3) * SR); out[i:i + len(c)] += c[: len(out) - i]
    return filt(out, 'high', 500) * env(len(out), 0.3, 1.2)
def pop(): t = tt(0.08); return np.sin(2 * np.pi * (900 - 6000 * t) * t) * np.exp(-t * 60)
def power_up(d=2.0):
    t = tt(d); f = 200 * (8 ** (t / d)); x = 2 * ((np.cumsum(f) / SR) % 1) - 1
    return filt(x, 'low', 4000) * (0.5 + 0.5 * np.sin(2 * np.pi * 14 * t)) * env(len(t), 0.05, 0.1) * 0.6
def slide_whistle(d=0.7):
    t = tt(d); f = 1800 * (0.25 ** (t / d)); return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.02, 0.1)
def thud(): t = tt(0.4); return np.tanh(3 * np.sin(2 * np.pi * (60 + 80 * np.exp(-t * 30)) * t)) * np.exp(-t * 12) + filt(noise(0.4), 'low', 800) * np.exp(-t * 20) * .5
def ka_ching():
    out = np.concatenate([filt(noise(0.06), 'band', [2000, 6000]) * np.exp(-tt(0.06) * 60), np.zeros(int(0.05 * SR))])
    b = bell(88, 1.4) + bell(93, 1.4) * 0.7
    return np.concatenate([out, b])
def chalk(d=4.4):
    out = np.zeros(int(d * SR)); i = 0
    while i < len(out):
        L = int(rng.uniform(.08, .22) * SR); s = filt(noise(L / SR), 'band', [2500, 7000]) * env(L, 0.01, 0.03) * rng.uniform(.3, .8)
        out[i:i + L] += s[: len(out) - i]; i += L + int(rng.uniform(.02, .12) * SR)
    return out
def click(): t = tt(0.05); return filt(noise(0.05), 'band', [1500, 5000]) * np.exp(-t * 120)
def shimmer(d=2.2):
    out = np.zeros(int(d * SR))
    for i, n in enumerate([84, 88, 91, 96, 100, 103]):
        b = bell(n, 1.5) * 0.5; j = int(i * 0.09 * SR); out[j:j + len(b)] += b[: len(out) - j]
    return out

for i in range(3): put(sfx, 0.35 + i * 0.45, phone_buzz(), 0.45, 0.3)
put(sfx, S['party'] - 0.15, record_scratch(), 0.5)
put(sfx, S['party'] + 0.2, party_horn(), 0.35, -0.5); put(sfx, S['party'] + 0.6, party_horn(), 0.3, 0.5)
put(sfx, S['party'] + 0.1, crowd(4.5), 0.55)
for i in range(10): put(sfx, S['party'] + 0.1 + rng.uniform(0, 1.2), pop(), 0.18, rng.uniform(-.8, .8))
put(sfx, lv + 0.35, click(), 0.6); put(sfx, lv + 0.4, power_up(2.1), 0.3)
put(sfx, lv + 4.55, slide_whistle(), 0.35); put(sfx, lv + 5.2, thud(), 0.6)
put(sfx, S['plan'] + 1.6, click(), 0.4); put(sfx, S['plan'] + 3.4, ka_ching(), 0.35, 0.2)
put(sfx, S['end'] + 0.6, applause(5.5), 0.55)
put(sfx, S['end'] + 2.2, chalk(4.4), 0.12, -0.2)
put(sfx, S['cta'] + 0.3, pop(), 0.3)
put(sfx, o + 0.25, shimmer(), 0.4)
for i in range(3): put(sfx, o + 1.1 + i * 0.1, click(), 0.3)

# UI sounds logged by the renderer
def tone(f, d, dec=6, tri=False):
    t = tt(d); w = (2 / np.pi) * np.arcsin(np.sin(2 * np.pi * f * t)) if tri else np.sin(2 * np.pi * f * t)
    return w * np.exp(-t * dec) * env(len(t), 0.004, 0.05)
def whoosh(v=0.5):
    t = tt(0.6); x = sweep_bp(noise(0.6), 250, 4000, 1.4)
    return x * np.sin(np.pi * t / t[-1]) ** 2 * v
def alarm():
    out = np.zeros(int(1.6 * SR))
    for i in range(4):
        t = tt(0.32); f = 640 - 220 * t / 0.32; s = filt(2 * ((np.cumsum(f) / SR) % 1) - 1, 'low', 2500) * env(len(t), 0.02, 0.08)
        j = int(i * 0.36 * SR); out[j:j + len(s)] += s
    return out
events = json.load(open('events.json'))
for e in events:
    t0, k = e[0], e[1]
    if k == 'whoosh': put(sfx, t0 - 0.12, whoosh(e[2] if len(e) > 2 else 0.6), 0.5)
    elif k == 'tick': put(sfx, t0, tone(1600, 0.05, 60), 0.05)
    elif k == 'ding':
        put(sfx, t0, verb(tone(988, .7, 4, True), .3), 0.3); put(sfx, t0 + 0.1, verb(tone(1480, .9, 4, True), .3), 0.26)
    elif k == 'alarm': put(sfx, t0, alarm(), 0.14)
    elif k == 'chime': pass

# ── narration ──
from vo import Voice
LINES = {
 'hook': ("He put his whole savings into one coin, and lost half of it in a day. His friend Ollie didn't. Stay for rule six.", 0.25),
 'party': ("Three days earlier, everyone was cheering for Rex. They said he was a genius.", 0.55),
 'ollie': ("Ollie only put five percent into new coins. And Rex laughed at him.", 0.5),
 'lev': ("Then Rex borrowed ten times more. One bad hour... liquidated.", 0.5),
 'plan': ("But Ollie had a plan. An exit at minus ten percent, and cash ready for the dip.", 0.5),
 'end': ("That's when Rex asked: can you teach me the playbook?", 0.9),
 'cta': ("Check your own portfolio before Rex does. WalletLens flags anything over five percent.", 0.3),
 'outro': ("WalletLens. Check less, live more. And don't forget to follow us.", 1.7),
}
k = Voice(os.path.join(TTS, 'model_q8.onnx'), os.path.join(TTS, 'voices.npz'))
for key, (text, off) in LINES.items():
    room = dict(SCENES)[key] - off - 0.35
    speed = 1.05
    a, sr = k.create(text, voice=VOICE, speed=speed, lang='en-us')
    if len(a) / sr > room:
        speed = min(1.4, speed * (len(a) / sr) / room); a, sr = k.create(text, voice=VOICE, speed=speed, lang='en-us')
    a = resample_poly(a, SR, sr)
    a = filt(a, 'high', 90); a = a / (np.max(np.abs(a)) + 1e-9) * 0.9
    put(vo, S[key] + off, verb(a, 0.06), 1.0, 0)
    print(f'  VO {key:6s} {len(a)/SR:4.1f}s of {room+0.35:.1f}s  speed {speed:.2f}')

# ── mix: duck music under the voice, glue, limit ──
ve = np.abs(vo[:, 0]); win = int(0.12 * SR)
ve = np.convolve(ve, np.ones(win) / win, 'same'); ve = ve / (ve.max() + 1e-9)
duck = 1 - 0.55 * np.clip(ve * 4, 0, 1)
mix = music * duck[:, None] * 0.8 + sfx * (1 - 0.25 * np.clip(ve * 4, 0, 1))[:, None] + vo * 1.05
fade = int(2.0 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = mix / (np.percentile(np.abs(mix), 99.9) + 1e-9) * 0.7
mix = np.tanh(mix * 1.3) / np.tanh(1.3) * 0.92
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open('soundtrack.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('soundtrack.wav', TOTAL, 's', len(events), 'events, voice', VOICE)
