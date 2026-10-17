# Voice pass: every spoken line gets its character's voice (Kokoro, local), fitted to its slot.
# Writes vo_<lang>/<scene>_<i>.wav, vo_<lang>.json (start times) and lips.js (mouth levels at 30 fps
# taken from the finished audio, so the on-screen mouths follow the real voice).
#   python3 voices.py <events.json> [lang]
# Trump and CZ are parody character voices, not clones of the real ones.
import json, os, re, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly
HERE = os.path.dirname(os.path.abspath(__file__)); TTS = os.path.join(HERE, 'tts')
sys.path.insert(0, HERE)
from vo import Voice
EV = json.load(open(sys.argv[1])); LANG = sys.argv[2] if len(sys.argv) > 2 else 'en'
SR = 48000; OUT = os.path.join(HERE, f'vo_{LANG}'); os.makedirs(OUT, exist_ok=True)
k = Voice(os.path.join(TTS, 'model_q8.onnx'), os.path.join(TTS, 'voices.npz'))
rng = np.random.default_rng(3)
def filt(x, kind, f): return sosfilt(butter(2, f, kind, fs=SR, output='sos'), x)
def room_ir(d, dec, lp):
    n = rng.standard_normal(int(d * SR)) * np.exp(-np.linspace(0, dec, int(d * SR))); n = filt(n, 'low', lp); return n / np.sqrt(np.sum(n ** 2))
IR_PRESS, IR_ROOM = room_ir(1.2, 7, 5000), room_ir(.5, 9, 6000)
def verb(x, ir, wet): return x + wet * fftconvolve(x, ir)[: len(x)]
def say(text, voice, speed):
    a, sr = k.create(text, voice=voice, speed=speed, lang='en-us'); return resample_poly(a, SR, sr)
def clean(t):
    t = re.sub(r'<[^>]+>', '', t).replace('−', 'minus ').replace('ten-x', 'ten x').replace('…', '... ')
    return re.sub(r'[“”"😉🚀👍🤝]', '', t).strip()
# speaker: (voice, base speed, pitch factor, chain)
# pitch factor > 1 = slower and lower (Trump's heavy, drawn-out podium delivery); < 1 = faster and higher (the influencer)
CAST = {'n': ('am_michael', 1.05, 1.0, 'narr'), 'h': ('am_puck', 1.1, 1.0, 'room'), 'c': ('am_liam', .98, 1.0, 'room'),
        't': ('am_onyx', .92, 1.08, 'potus'), 'i': ('am_echo', 1.12, .8, 'phone'), 'a': ('af_sky', 1.08, 1.0, 'robot'),
        'b': ('af_sarah', 1.1, 1.0, 'tv')}
def chain(a, kind):
    a = filt(a, 'high', 90)
    if kind == 'narr': return verb(a, IR_ROOM, .04)
    if kind == 'room': return verb(a, IR_ROOM, .12)
    if kind == 'potus':  # podium mic: band-limited, a little grit, big room
        a = filt(filt(a, 'high', 130), 'low', 7000); a = np.tanh(a / (np.abs(a).max() + 1e-9) * 1.8); return verb(a, IR_PRESS, .22)
    if kind == 'phone': a = filt(filt(a, 'high', 320), 'low', 4200); return np.tanh(a / (np.abs(a).max() + 1e-9) * 2.2)
    if kind == 'tv': return verb(filt(filt(a, 'high', 200), 'low', 6000), IR_ROOM, .05)
    if kind == 'robot':
        t = np.arange(len(a)) / SR; return verb(a * .8 + a * np.sin(2 * np.pi * 55 * t) * .35, IR_ROOM, .1)
    return a
def reporters():
    out = np.zeros(int(2.4 * SR))
    for j, (v, off) in enumerate((('am_adam', 0), ('bm_lewis', .22), ('af_nicole', .45), ('am_liam', .7), ('bf_emma', .9), ('am_fenrir', 1.15))):
        a = say('Mister President!' if j % 2 == 0 else 'Mister President! Sir!', v, 1.25) * (.6 + .4 * rng.random())
        i = int(off * SR); a = a[: len(out) - i]; out[i:i + len(a)] += a
    return verb(filt(out, 'high', 150), IR_PRESS, .3)
# Trump: a parody character voice built here, not a clone. A blend of Kokoro styles that lands in his
# speaking range (~120 Hz, wide swings), delivered phrase by phrase with dramatic pauses, the
# signature words punched and drawn out, then a nasal, raspy podium-mic treatment.
POTUS = (.4 * k.get_voice_style('am_onyx') + .3 * k.get_voice_style('am_santa') + .3 * k.get_voice_style('am_adam')).astype(np.float32)
PUNCH = ('tremendous', 'huge', 'nobody', 'hundred', 'everything', 'believe', 'beautiful', 'welcome', 'hello', 'panic', 'moon', 'seen', 'maybe')
def peak(x, f, gain_db, q=1.2):  # RBJ peaking EQ
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    from scipy.signal import lfilter; return lfilter(np.array(b) / a[0], np.array(a) / a[0], x)
def potus(text, room):
    frags = [f.strip() for f in re.split(r'(?<=[.!?])\s+', clean(text)) if f.strip()]
    for f_ in (1.0, 1.08, 1.16, 1.25, 1.35, 1.45, 1.55):  # re-voice faster (never pitch-shift) until it fits its slot
        parts = []
        for f in frags:
            punch = any(w in f.lower() for w in PUNCH)
            parts.append((say(f, POTUS, (.8 if punch else .9) * f_) * (1.25 if punch else 1.0), (.42 if f.endswith(('.', '!')) else .25) / f_))
        speech = sum(len(a) for a, _ in parts) / SR; gaps = sum(g for _, g in parts[:-1])
        if speech + gaps * .45 <= room: break
    if speech + gaps > room: sc = max(.45, (room - speech) / gaps) if gaps else 0; parts = [(a, g * sc) for a, g in parts]
    out = np.concatenate([np.concatenate([a, np.zeros(int(g * SR))]) for a, g in parts[:-1]] + [parts[-1][0]])
    out = filt(filt(out, 'high', 140), 'low', 7500); out = peak(out, 1150, 7, 1.4); out = peak(out, 2800, 3, 1.0); out = peak(out, 260, -3, .8)
    env = np.abs(out); env = np.convolve(env, np.ones(240) / 240, 'same')
    rasp = filt(rng.standard_normal(len(out)), 'band', [1800, 5500]) * env * .9
    out = np.tanh((out + rasp) / (np.abs(out).max() + 1e-9) * 2.4)
    return verb(out, IR_PRESS, .2)
man, lips = [], {}
for e in EV:
    if e[1] != 'vo': continue
    t0, text, room, who, key, i = e[0], e[2], e[3], e[4], e[5], e[6]
    if who == 'r': a = reporters(); sp = 1.25
    elif who == 't': a = potus(text, room); sp = 0
    else:
        voice, sp, pf, kind = CAST[who]; txt = clean(text)
        a = say(txt, voice, sp); need = len(a) / SR * pf
        if need > room: sp = min(1.38, sp * need / max(.4, room)); a = say(txt, voice, sp)
        if pf != 1.0: a = resample_poly(a, int(pf * 100), 100)  # changes pitch and pace together
        a = chain(a, kind)
    a = a / (np.abs(a).max() + 1e-9) * .9
    fn = f'{key}_{i}.wav'
    with wave.open(os.path.join(OUT, fn), 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((a * 32767).astype(np.int16).tobytes())
    man.append([t0, fn, who]); flag = '  ⚠ over' if len(a) / SR > room + .3 else ''
    print(f'{t0:6.1f}s {who} {len(a)/SR:4.1f}/{room:4.1f}s x{sp:.2f}  {text[:50]}{flag}')
    if who in 'htc':
        hop = SR // 30; r = np.array([np.sqrt(np.mean(a[j:j + hop] ** 2)) for j in range(0, len(a) - hop, hop)])
        r = np.clip((r / (np.percentile(r, 92) + 1e-9)) ** .75, 0, 1); r[r < .14] = 0
        lips[f'{key}:{i}'] = [round(float(x), 2) for x in r]
json.dump(man, open(os.path.join(HERE, f'vo_{LANG}.json'), 'w'))
open(os.path.join(HERE, 'lips.js'), 'w').write('window.LIPS=' + json.dumps(lips, separators=(',', ':')) + ';')
print(len(man), 'lines,', len(lips), 'lip tracks')
