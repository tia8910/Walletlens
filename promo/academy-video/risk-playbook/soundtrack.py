# Builds soundtrack_<lang>.wav for the 5-minute Risk Playbook film from the cues the renderer logged
# (frames*-events.json): scene starts with their music style and set, the spoken lines, and sound effects.
# Layers: score that never drops out (except the gags that need silence), an ambience bed per location
# (press-room crowd and shutters, office murmur, night city, dawn birds), political sounds (rally chant,
# breaking-news sting, opening bell, reporters) and the cast's voices from voices.py.
# Everything is synthesised or generated locally (Kokoro TTS), so nothing needs a licence.
#   python3 soundtrack.py <cast|none|recordings-folder> <events.json> <en|ar>
#   cast = the per-line files voices.py wrote (vo_<lang>/, falling back to vo_en/)
import json, os, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
VOICE = sys.argv[1] if len(sys.argv) > 1 else 'cast'
EVENTS = sys.argv[2] if len(sys.argv) > 2 else 'events.json'
LANG = sys.argv[3] if len(sys.argv) > 3 else 'en'
SR = 48000
ev = json.load(open(EVENTS))
scenes = [(e[0], e[2], e[3], e[4]) for e in ev if e[1] == 'scene']
sets = {e[2]: (e[5] if len(e) > 5 else '') for e in ev if e[1] == 'scene'}
start = {e[2]: e[0] for e in ev if e[1] == 'scene'}
TOTAL = scenes[-1][0] + scenes[-1][2]
N = int(TOTAL * SR) + SR
rng = np.random.default_rng(5)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2)); vo = np.zeros((N, 2)); amb = np.zeros((N, 2))

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
    else: put(music, t0, saw([33, 40], d, 400), .16)
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

# ── voices ──
def load(p):
    w = wave.open(p); sr = w.getframerate(); ch = w.getnchannels(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    a = a.reshape(-1, ch).mean(1) if ch > 1 else a; return resample_poly(a, SR, sr) if sr != SR else a
lines = [(e[0], e[2], e[3], e[4] if len(e) > 4 else 'n') for e in ev if e[1] == 'vo']
PAN = {'h': -.18, 'f': .18, 't': 0, 'i': .1, 'a': -.1, 'r': 0, 'b': 0, 'n': 0}
if VOICE == 'cast':
    mf = os.path.join(HERE, f'vo_{LANG}.json'); mf = mf if os.path.exists(mf) else os.path.join(HERE, 'vo_en.json')
    vd = os.path.join(HERE, os.path.basename(mf)[:-5])
    for t0, fn, who in json.load(open(mf)): put(vo, t0, load(os.path.join(vd, fn)), .62 if who == 'r' else 1.0, PAN.get(who, 0))
elif VOICE != 'none' and os.path.isdir(VOICE):
    for i, (t0, text, room, who) in enumerate(lines):
        p = os.path.join(VOICE, f'{i + 1:02d}.wav')
        if os.path.exists(p): a = filt(load(p), 'high', 90); put(vo, t0, verb(a / (np.abs(a).max() + 1e-9) * .9, .06), 1.0, PAN.get(who, 0))

# ── ambience beds and the politics ──
from vo import Voice
K = Voice(os.path.join(HERE, 'tts', 'model_q8.onnx'), os.path.join(HERE, 'tts', 'voices.npz'))
def tts(text, v, sp=1.0): a, sr = K.create(text, voice=v, speed=sp, lang='en-us'); return resample_poly(a, SR, sr)
BAB = os.path.join(HERE, 'babble.npy')
if os.path.exists(BAB): babble = np.load(BAB)
else:  # a room full of people talking: many voices, overlapped, blurred
    talk = ['So what did the market do today', 'I told him that already, twice', 'Did you see the numbers this morning', 'No way, are you serious',
            'We should get lunch after this', 'The meeting got moved to three', 'Honestly I have no idea what happens next', 'Can you send me that file',
            'He said the deal is basically done', 'Wait, who posted that', 'I need more coffee', 'That is a lot of money']
    vs = ['am_adam', 'af_nicole', 'bm_lewis', 'af_bella', 'am_liam', 'bf_emma', 'am_echo', 'af_kore', 'bm_daniel', 'af_river']
    babble = np.zeros(int(16 * SR))
    for j in range(34):
        a = tts(talk[j % len(talk)], vs[j % len(vs)], rng.uniform(.95, 1.15)) * rng.uniform(.4, 1); i0 = int(rng.uniform(0, 16) * SR)
        a = np.concatenate([a, np.zeros(1)]); seg = np.zeros(len(babble)); n = min(len(a), len(babble)); seg[:n] = a[:n]; babble += np.roll(seg, i0)
    babble = filt(filt(babble, 'low', 3200), 'high', 160); babble = verb(babble / (np.abs(babble).max() + 1e-9), .5); np.save(BAB, babble)
def bed(sig, t0, d, g, fade=.6):
    n = int(d * SR); x = np.tile(sig, int(np.ceil(n / len(sig))) + 1)[:n] if len(sig) < n else sig[:n]
    put(amb, t0, x * env(n, fade, fade), g)
def hum(d, f0=55): t = tt(d); return filt(noise(d), 'low', 260) * .5 + np.sin(2 * np.pi * f0 * t) * .08 + np.sin(2 * np.pi * f0 * 2 * t) * .04
def traffic(d): t = tt(d); return filt(noise(d), 'low', 500) * (.6 + .4 * np.sin(2 * np.pi * t / 7.3)) * .7
def shutter():
    t = tt(.09); c = filt(noise(.09), 'band', [1200, 7000]) * np.exp(-t * 90); c2 = np.zeros(len(t)); j = int(.045 * SR); c2[j:] = c[: len(t) - j] * .7; return c + c2
def shutters(d, rate=3.0):
    out = np.zeros(int(d * SR)); tcur = 0
    while tcur < d - .3:
        for b in range(int(rng.integers(1, 5))):  # bursts, like a motor drive
            j = int((tcur + b * .11) * SR); s2 = shutter() * rng.uniform(.4, 1)
            if j + len(s2) < len(out): out[j:j + len(s2)] += s2
        tcur += rng.exponential(1 / rate) + .25
    return out
def birds(d):
    out = np.zeros(int(d * SR)); tcur = .3
    while tcur < d - .5:
        for c in range(int(rng.integers(2, 5))):
            dd = rng.uniform(.06, .14); t = tt(dd); f = rng.uniform(2800, 4200) * (1 + .35 * np.sin(np.pi * t / dd)); ch = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / dd) ** 2
            j = int((tcur + c * .17) * SR); out[j:j + len(ch)] += ch[: len(out) - j] * .5
        tcur += rng.uniform(.8, 2.2)
    return verb(out, .3)
def crickets(d):
    t = tt(d); return filt(np.sin(2 * np.pi * 4300 * t) * ((np.sin(2 * np.pi * 28 * t) > .2) * (np.sin(2 * np.pi * .9 * t) > .3)), 'band', [3000, 6000]) * .5
def keys(d):
    out = np.zeros(int(d * SR)); i = 0
    while i < len(out) - 3000:
        if rng.random() < .82: c = filt(noise(.025), 'band', [2000, 7000]) * np.exp(-tt(.025) * 200) * rng.uniform(.2, .6); out[i:i + len(c)] += c
        i += int(rng.uniform(.08, .5) * SR)
    return out
def water(d): t = tt(d); return filt(noise(d), 'band', [200, 1400]) * (.55 + .45 * np.sin(2 * np.pi * t * .7) * np.sin(2 * np.pi * t * 1.9)) * .6
def chant(reps=3, period=1.45):  # rally crowd: "U! S! A!"
    out = np.zeros(int((reps * period + 2) * SR)); vs = ['am_adam', 'am_onyx', 'af_nicole', 'bm_lewis', 'am_liam', 'af_sarah', 'am_fenrir', 'bf_emma', 'am_echo', 'af_bella']
    syl = {v: [tts(x, v, 1.2) for x in ('You!', 'Ess!', 'Ay!')] for v in vs}
    for r in range(reps):
        for si in range(3):
            for v in vs:
                a = syl[v][si][: int(.45 * SR)] * rng.uniform(.5, 1); j = int((r * period + si * .34 + rng.normal(0, .02)) * SR)
                if 0 <= j < len(out) - len(a): out[j:j + len(a)] += a
    return verb(filt(out, 'high', 140), .6) * env(len(out), .1, .8)
def sting():  # breaking-news hit: brass stab, timpani, whoosh
    t = tt(1.6); stab = saw([50, 57, 62, 65], 1.6, 3000) * np.exp(-t * 2.2) * 2.5
    tim = np.sin(2 * np.pi * np.cumsum(70 + 40 * np.exp(-t * 9)) / SR) * np.exp(-t * 3)
    return verb(np.tanh((stab + tim * .9) * 1.2), .35)
def opening_bell(d=2.2):
    out = np.zeros(int(d * SR))
    for j in range(int(d * 14)):
        b = bell(83, .5) * .6; i = int(j / 14 * SR); out[i:i + len(b)] += b[: len(out) - i]
    return out * env(len(out), .01, .5)
def cheer(d=3.0):
    t = tt(d); return (filt(noise(d), 'band', [600, 3500]) * .5 + filt(babble[: len(t)] if len(babble) >= len(t) else np.resize(babble, len(t)), 'high', 400)) * np.sin(np.pi * t / d) ** .6
def phones(d=2.5):
    out = np.zeros(int(d * SR))
    for j in range(16):
        p = tone(rng.choice([1318, 1568, 1760, 2093]), .25, 9) * rng.uniform(.3, .8); i = int(rng.uniform(0, d - .3) * SR); out[i:i + len(p)] += p
        b = buzz()[: int(.35 * SR)] * .25; i = int(rng.uniform(0, d - .4) * SR); out[i:i + len(b)] += b
    return out
for t0, key, d, style in scenes:
    st = sets.get(key, '')
    if st == 'press':
        bed(hum(d, 60), t0, d, .14)
        if key == 'kidding': bed(babble, t0, d, .42); put(amb, t0 + .2, shutters(d - .4, 4.0), .55, .3); put(amb, t0 + .3, shutters(d - .6, 3.0), .45, -.3)
        else: bed(traffic(d), t0, d, .1)
    elif st == 'bed':
        bed(hum(d, 50), t0, d, .12); bed(traffic(d), t0, d, .1)
        if key in ('flood', 'crash'): bed(water(d), t0, d, .35)
        if key == 'friendsleep': bed(birds(d), t0, d, .3)
    elif st == 'caf':
        bed(babble, t0, d, .16); put(amb, t0, keys(d), .08, .5)
    elif st == 'ins':
        t = tt(d); bed(np.sin(2 * np.pi * 110 * t) * .05 + filt(noise(d), 'band', [2000, 6000]) * .04, t0, d, .5)
if 'c_post' in start: t0 = start['c_post']; put(sfx, t0 + 2.5, sting(), .55); put(amb, t0 + 3.6, phones(3.0), .4); put(amb, t0 + 3.4, chant(2), .38)
if 'newsmix' in start: t0 = start['newsmix']; put(sfx, t0, sting(), .6); put(amb, t0 + 3.6, chant(3), .45); put(amb, t0 + 1.0, shutters(8, 3), .35)
if 'kidding' in start: t0 = start['kidding']; put(sfx, t0 + 6.3, opening_bell(), .4); put(amb, t0 + 6.6, cheer(3), .45)
def airhorn(d=.9):
    t = tt(d); x = sum(2 * ((t * f) % 1) - 1 for f in (440, 554, 660)); return np.tanh(filt(x, 'band', [300, 3500]) * 2) * env(len(t), .01, .15) * ((t % .3) < .24)
def drop(d=1.6): t = tt(d); return np.tanh(3 * np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 2.2) + 35) / SR)) * env(len(t), .005, .6)
if 'hype' in start: t0 = start['hype']; put(sfx, t0 + 3.3, airhorn(), .32); put(sfx, t0 + 6.4, airhorn(), .3); put(sfx, t0 + 7.0, drop(), .45)
for k2 in ('cz1', 'cz2'):
    if k2 in start: t0 = start[k2]; put(amb, t0, filt(noise(sum(d for _, kk, d, _ in scenes if kk == k2)), 'low', 300) * .5, .2)
if 'week' in start:  # the gag: everyone is asleep, so the panic never comes — the score cuts to crickets for "…Hello?"
    t0 = start['week']; a, b = int((t0 + 15.8) * SR), int((t0 + 19.6) * SR); f = int(.25 * SR)
    music[a:a + f] *= np.linspace(1, 0, f)[:, None]; music[a + f:b] = 0; music[b:b + f] *= np.linspace(0, 1, f)[:, None]
    put(amb, t0 + 15.9, crickets(3.6), .28)

# ── mix ──
ve = np.abs(vo[:, 0]) + 1e-12; win = int(.12 * SR); ve = np.convolve(ve, np.ones(win) / win, 'same'); ve = ve / (ve.max() + 1e-9)
d = np.clip(ve * 4, 0, 1)
mix = music * (1 - .3 * d)[:, None] * 1.55 + amb * (1 - .45 * d)[:, None] + sfx * (1 - .2 * d)[:, None] + vo * 1.1
mix = mix[: int(TOTAL * SR)]; fade = int(2 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix = mix / (np.percentile(np.abs(mix), 99.9) + 1e-9) * .7; mix = np.tanh(mix * 1.3) / np.tanh(1.3) * .92
with wave.open(os.path.join(HERE, f'soundtrack_{LANG}.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print(f'soundtrack_{LANG}.wav {TOTAL:.1f}s · {len(scenes)} scenes · {len(lines)} lines · voices: {VOICE}')
