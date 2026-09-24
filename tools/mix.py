"""Soundtrack for MIDWAY · 10:22, synthesized in code. No melody anywhere: the Dauntless's radial engine and
the wind, the oxygen mask, radio static, the shriek of the perforated dive brakes, a drone that keeps rising,
flak, the carrier's guns, a heartbeat, the clunk of the release, the grey-out, then the explosions.

    node -e "..." writes build/cues.json (film timing); python3 tools/mix.py -> build/mix.wav, build/mix.m4a, data/mix.m4a
"""
import os, math, json, subprocess, hashlib
import numpy as np
import soundfile as sf
from scipy import signal

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")
C = json.load(open(os.path.join(BUILD, "cues.json")))
SR = 48000
T = C["total"]
N = int(T * SR)
rng = np.random.default_rng(1942)
t_all = (np.arange(N) / SR).astype(np.float32)

def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, min(f, SR * 0.45), "low", fs=SR, output="sos"), x).astype(np.float32)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, "high", fs=SR, output="sos"), x).astype(np.float32)
def bp(x, a, b, o=2): return signal.sosfilt(signal.butter(o, [a, min(b, SR * 0.45)], "band", fs=SR, output="sos"), x).astype(np.float32)
def noise(n): return rng.standard_normal(n).astype(np.float32)
def env_exp(n, tau): return np.exp(-np.arange(n) / (tau * SR)).astype(np.float32)
def fftconv(x, h):
    n = len(x) + len(h) - 1; size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(h, size), size)[:len(x)].astype(np.float32)
def ir(sec, decay, bright, seed):
    r = np.random.default_rng(seed); n = int(sec * SR); t = np.arange(n) / SR
    h = lp((r.standard_normal(n) * np.exp(-t / decay)).astype(np.float32), bright)
    return h / np.sqrt(np.sum(h ** 2))
def ss(a, b, t): x = np.clip((t - a) / (b - a), 0, 1); return (x * x * (3 - 2 * x)).astype(np.float32)
def win(a, b, fa=0.05, fb=0.05, t=t_all): return (ss(a - fa, a, t) * (1 - ss(b, b + fb, t))).astype(np.float32)
def mtof(m): return 440 * 2 ** ((m - 69) / 12)

class Bus:
    def __init__(self): self.L = np.zeros(N, np.float32); self.R = np.zeros(N, np.float32)
    def add(self, x, t, g=1.0, pan=0.0):
        i = int(t * SR)
        if i >= N: return
        if i < 0: x = x[-i:]; i = 0
        e = min(N, i + len(x)); a = (pan + 1) * math.pi / 4
        self.L[i:e] += x[:e - i] * g * math.cos(a); self.R[i:e] += x[:e - i] * g * math.sin(a)
    def mono(self, x, g=1.0):
        self.L += x * g * 0.707; self.R += x * g * 0.707
    def stereo(self, l, r, g=1.0): self.L += l * g; self.R += r * g

plane, deck, music, sfx, voice = Bus(), Bus(), Bus(), Bus(), Bus()
TL = C
shot_names = C["shots"]
def shot_mask(names, fade=0.04):
    m = np.zeros(N, np.float32)
    for i, (t0, nm_) in enumerate(shot_names):
        t1 = shot_names[i + 1][0] if i + 1 < len(shot_names) else T
        if nm_ in names: m = np.maximum(m, win(t0, t1, fade, fade))
    return m
COCKPIT = shot_mask({"cruise", "brakes", "push", "scope1", "scope2", "over", "pullout"})
NEARPLANE = shot_mask({"destroyer", "formation"})
GUNNER = shot_mask({"gunner"})
ONDECK = shot_mask({"deck", "sky"})
INPLANE = np.clip(COCKPIT + NEARPLANE + GUNNER, 0, 1)

# ---------------- speed and state of our aircraft ----------------
push, dive, rel = C["push"], C["dive"], C["release"]
v = 70 + 58 * ss(push + 0.8, push + 9, t_all) - 18 * ss(rel, rel + 4, t_all)
flap = ss(15.95, 16.7, t_all) * (1 - ss(rel + 0.6, rel + 2.4, t_all))

# ---------------- the Wright Cyclone: nine cylinders, three blades ----------------
def engine():
    f = 150 + 22 * ss(push + 1, push + 10, t_all) - 10 * ss(rel, rel + 3, t_all) + 1.5 * np.sin(2 * np.pi * 0.23 * t_all)
    f = f + lp(noise(N), 3) * 6
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.zeros(N, np.float32)
    for k in range(1, 14):
        a = 1 / k ** 0.75 * (1.3 if k in (2, 3) else 1)
        x += (a * np.sin(k * ph + rng.uniform(0, 6))).astype(np.float32)
    rough = 1 + 0.35 * np.sin(ph / 9 + 1) + 0.2 * np.sin(ph / 4.5)          # uneven firing
    x = np.tanh(x * rough * 0.6).astype(np.float32)
    blade = np.sin(ph * 0.47) ** 8 * 0.8                                        # propeller blade pass
    thump = lp((blade * noise(N) * 0.5 + blade).astype(np.float32), 400)
    return x * 0.5 + thump * 0.6
eng = engine()
# inside the cockpit the fuselage filters it; outside, the prop roars
cock_eng = lp(eng, 1800, 2) + hp(lp(eng, 4000), 900) * 0.25
out_eng = lp(eng, 5000) + bp(noise(N), 180, 1400) * 0.25
wind = bp(noise(N), 250, 2600) * ((v / 70) ** 2.2).astype(np.float32)
wind += bp(noise(N), 2500, 7000) * ((v / 128) ** 3).astype(np.float32) * 0.5
wind *= (0.85 + 0.15 * np.sin(2 * np.pi * 0.37 * t_all)).astype(np.float32)
# dive brakes: a howl that climbs with speed, fluttering with the buffet
def shriek():
    fc = 820 + 520 * np.clip((v - 70) / 58, 0, 1) + 90 * ss(38, 49.5, t_all)
    x = np.zeros(N, np.float32)
    for mult, a in [(1, 1.0), (1.51, 0.65), (2.27, 0.4), (3.1, 0.2)]:
        fr = fc * mult * (1 + 0.004 * np.sin(2 * np.pi * 5.3 * t_all * mult))
        ph = 2 * np.pi * np.cumsum(fr) / SR
        tone = np.sin(ph).astype(np.float32) * (0.55 + 0.45 * lp(np.abs(noise(N)), 30))
        x += tone * a
    # breathy turbulence around the tones
    x += bp(noise(N), 600, 3200) * 0.9
    flutter = 1 + 0.35 * np.sin(2 * np.pi * (17 + 6 * ss(30, 49, t_all)) * t_all) * ss(push, push + 6, t_all)
    level = flap * (0.25 + 0.75 * np.clip((v - 70) / 58, 0, 1)) * (0.8 + 0.5 * ss(38, 49.3, t_all))
    return (x * flutter * level).astype(np.float32)
shr = shriek()
plane.mono(cock_eng * COCKPIT * (1 - 0.35 * shot_mask({"scope1", "scope2"})), 0.33)
plane.mono(out_eng * (NEARPLANE + GUNNER * 0.9), 0.36)
plane.stereo(wind * INPLANE * 0.9, np.roll(wind, 311) * INPLANE * 0.9, 0.2)
plane.stereo(shr * INPLANE, np.roll(shr, 97) * INPLANE, 0.16)
# radio static on the headset while searching
static = bp(noise(N), 900, 4500) * (0.5 + 0.5 * (lp(np.abs(noise(N)), 12) > 0.9)).astype(np.float32)
crackle = np.zeros(N, np.float32)
for _ in range(260):
    i = int(rng.uniform(1.8, 18) * SR); m = int(0.012 * SR)
    crackle[i:i + m] += hp(noise(m), 2000) * env_exp(m, 0.002) * rng.uniform(0.3, 1.5)
plane.mono((static * 0.08 + crackle * 0.5) * win(1.8, 17.5, 0.8, 1.2), 0.25)

# ---------------- the oxygen mask ----------------
def breath(inhale=True, dur=1.1, strain=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** (1.5 if inhale else 0.8)
    x = bp(noise(n), 700, 3400) if inhale else bp(noise(n), 250, 1800)
    x = x * e.astype(np.float32)
    if not inhale:   # the rubber flap of the exhalation valve
        m = int(0.03 * SR); x[:m] += lp(noise(m), 600) * env_exp(m, 0.006) * 2
    if strain > 0:   # the grunt of a man straining against the g
        f0 = 105; ph = 2 * np.pi * f0 * t * (1 + 0.1 * np.sin(2 * np.pi * 7 * t))
        buzz = (signal.sawtooth(ph) * e).astype(np.float32)
        x += (bp(buzz, 400, 800) + bp(buzz, 1000, 1500) * 0.6 + bp(buzz, 2300, 2800) * 0.3) * strain
    return x.astype(np.float32)
t = 0.8; k = 0
while t < rel + 3.2:
    period = 3.6 if t < push else 2.4 if t < 39 else 1.6
    strain = 0.0
    if t > rel - 0.2: strain = 1.2; period = 1.1
    if not (C["deck"] - 0.4 < t < C["scope2"] - 0.2):
        voice.add(breath(True, period * 0.34, strain * 0.3), t, 0.10 + 0.08 * strain, -0.05)
        voice.add(breath(False, period * 0.3, strain), t + period * 0.42, 0.08 + 0.12 * strain, 0.05)
    t += period

# ---------------- the radio ----------------
def tts(text, voice_, speed, lang="en-us"):
    cache = os.path.join(BUILD, "line_" + hashlib.sha1(f"{text}|{voice_}|{speed}|{lang}".encode()).hexdigest()[:10] + ".wav")
    if not os.path.exists(cache):
        from kokoro_onnx import Kokoro
        md = os.path.join(BUILD, "tts-model")
        k = Kokoro(os.path.join(md, "kokoro.onnx"), os.path.join(md, "voices.bin"))
        a, sr = k.create(text, voice=voice_, speed=speed, lang=lang)
        sf.write(cache, a, sr)
    a, sr = sf.read(cache, dtype="float32")
    a = signal.resample_poly(a, 2, 1).astype(np.float32)
    idx = np.where(np.abs(a) > 0.01)[0]
    return a[idx[0]:idx[-1] + 2000] if len(idx) else a
def radio(x):
    y = bp(x, 400, 2800, 3); y = np.tanh(y * 5) / 3
    return y + bp(noise(len(y)), 1200, 4500) * 0.02
line = radio(tts("Carriers... dead ahead.", "am_michael", 0.95))
m = int(0.09 * SR)
voice.add(bp(noise(m), 1500, 5000) * 0.3, 12.18, 0.6)          # the key clicks
voice.add(line, 12.3, 0.95)
voice.add(bp(noise(m), 1500, 5000) * 0.3, 12.3 + len(line) / SR + 0.05, 0.6)
# on Akagi's deck: the lookout's cry
cry = tts("きゅうこうか！", "jm_kumo", 1.15, "ja")
cry = np.tanh(hp(cry, 150) * 3) / 2
deck.add(cry, C["deck"] + 1.15, 0.8, -0.3)
deck.add(lp(cry, 2000), C["deck"] + 1.35, 0.18, 0.4)     # echo off the island

# ---------------- Akagi's flight deck ----------------
dk = ONDECK
deckwind = bp(noise(N), 120, 1500) * 0.7 + lp(noise(N), 150) * 1.2
idle = np.zeros(N, np.float32)
for f0, pan in [(46, -0.4), (51, 0.3), (43, 0.6)]:     # engines warming up on the planes spotted aft
    ph = 2 * np.pi * np.cumsum(f0 + lp(noise(N), 2) * 2) / SR
    x = sum(np.sin(k * ph) / k for k in range(1, 12)).astype(np.float32)
    idle += lp(np.tanh(x * 0.8), 1500)
deck.mono(deckwind * dk, 0.12); deck.mono(idle * dk, 0.09)
# alarm bell
def ring(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    clap = (np.sin(2 * np.pi * 18 * t) > 0).astype(np.float32)
    tone = (np.sin(2 * np.pi * 1180 * t) + 0.6 * np.sin(2 * np.pi * 2710 * t) + 0.3 * np.sin(2 * np.pi * 3950 * t)).astype(np.float32)
    return tone * (0.4 + 0.6 * lp(clap, 60)) * np.minimum(1, t / 0.01).astype(np.float32)
rg = ring(C["scope2"] - C["deck"] - 1.6); rg[-int(0.1 * SR):] *= np.linspace(1, 0, int(0.1 * SR))
deck.add(rg, C["deck"] + 1.6, 0.05, 0.5)
# the carrier's 25 mm guns open up
def gun(big=1.0):
    n = int(0.5 * SR)
    return (hp(noise(n), 150) * env_exp(n, 0.012) * 1.5 + np.sin(2 * np.pi * 80 * np.arange(n) / SR).astype(np.float32) * env_exp(n, 0.07) * big).astype(np.float32)
t = C["deck"] + 2.3
while t < C["scope2"]:
    deck.add(gun(), t, 0.22 * rng.uniform(0.6, 1), rng.uniform(-0.8, 0.8)); t += rng.uniform(0.08, 0.2)
# the shriek coming down out of the sun, heard from the deck
dist_shriek = lp(shr, 2500)
deck.mono(dist_shriek * dk * ss(C["deck"] + 0.5, C["scope2"], t_all), 0.1)

# ---------------- flak, tracers ----------------
def burst(close):
    n = int(1.6 * SR); t = np.arange(n) / SR
    crack = hp(noise(n), 300) * env_exp(n, 0.01 + 0.02 * (1 - close)) * 1.6
    body = lp(noise(n), 500) * env_exp(n, 0.15 + 0.3 * (1 - close))
    thump = np.sin(2 * np.pi * (55 + 30 * np.exp(-t * 20)) * t).astype(np.float32) * env_exp(n, 0.2)
    x = crack * (0.3 + close) + body + thump * 0.8
    if close > 0.5:   # fragments rattling on the skin
        for _ in range(int(12 * close)):
            i = int(rng.uniform(0.03, 0.5) * SR); m = int(0.01 * SR)
            x[i:i + m] += hp(noise(m), 2500) * env_exp(m, 0.002) * 1.2
    return x.astype(np.float32)
for tb, d in C["flak"]:
    d_eff = d * 0.55
    ts = tb + d_eff / 340
    close = float(np.clip(1 - (d_eff - 80) / 300, 0, 1))
    g = 0.5 * (80 / max(80, d_eff)) ** 0.7
    sfx.add(burst(close), ts, g, rng.uniform(-0.7, 0.7))
# bullets snapping past in the last seconds
for _ in range(90):
    ts = rng.uniform(41, rel + 1.5)
    m = int(0.02 * SR)
    sfx.add(hp(noise(m), 1800) * env_exp(m, 0.003), ts, rng.uniform(0.15, 0.4), rng.uniform(-0.9, 0.9))
# distant pom-poms from below, through the dive
t = 38.0
while t < rel:
    sfx.add(lp(gun(0.6), 900), t, 0.06, rng.uniform(-0.5, 0.5)); t += rng.uniform(0.1, 0.3)
# Kaga, hit far off to the side
def boom(size=1.0, dur=6.0):
    n = int(dur * SR); t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * (34 + 40 * np.exp(-t * 6)) * t).astype(np.float32) * env_exp(n, 0.9 * size)
    body = lp(noise(n), 700) * env_exp(n, 0.5 * size) * 1.4 + lp(noise(n), 160) * env_exp(n, 1.4 * size) * 1.5
    crack = hp(noise(n), 800) * env_exp(n, 0.03) * 1.2
    roar = bp(noise(n), 300, 2500) * env_exp(n, 0.7 * size) * 1.1
    x = sub * 1.3 + body + crack + roar
    for _ in range(int(20 * size)):   # debris, secondary pops
        i = int(rng.uniform(0.2, dur * 0.7) * SR); m = int(0.25 * SR)
        if i + m < n: x[i:i + m] += lp(noise(m), rng.uniform(800, 3000)) * env_exp(m, rng.uniform(0.02, 0.08)) * rng.uniform(0.2, 0.8)
    return np.tanh(x * 0.8).astype(np.float32)
sfx.add(lp(boom(1.0), 400), C["kagaHit"] + 1.2, 0.35, -0.6)
sfx.add(lp(boom(1.0), 300), C["soryuHit"] + 1.5, 0.2, 0.6)
# the fall through the gap in the cloud
m = int(2.2 * SR)
whoosh = bp(noise(m), 300, 3000) * np.sin(np.pi * np.arange(m) / m).astype(np.float32) ** 2
sfx.add(whoosh, 44.6, 0.5)

# ---------------- release, pull-out, the rear seat ----------------
def clunk():
    n = int(0.6 * SR); t = np.arange(n) / SR
    return (lp(noise(n), 900) * env_exp(n, 0.03) * 2 + np.sin(2 * np.pi * 140 * t).astype(np.float32) * env_exp(n, 0.08) + bp(noise(n), 2000, 5000) * env_exp(n, 0.01)).astype(np.float32)
sfx.add(clunk(), rel, 0.9)
# heartbeat: under the last of the dive, thunderous in the grey-out
def thump(f=50, d=0.14):
    n = int(0.45 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t * (1 + 0.6 * np.exp(-t * 30))) * np.exp(-t / d) + bp(noise(n), 60, 400) * np.exp(-t / 0.04) * 0.4).astype(np.float32)
t = 39.4
while t < rel + 3.3:
    bpm = 78 + 80 * ss(39.4, rel, t)
    g = 0.25 + 0.3 * ss(39.4, rel, t) + 0.5 * ss(rel, rel + 0.6, t) * (1 - ss(rel + 2.4, rel + 3.3, t))
    sfx.add(thump(), t, g); sfx.add(thump(44, 0.1), t + 0.25 * 60 / bpm, g * 0.6)
    t += 60 / bpm
# twin .30s from the rear seat
def rattle(t0, dur):
    t = t0
    while t < t0 + dur:
        n = int(0.12 * SR)
        shot = (hp(noise(n), 400) * env_exp(n, 0.006) * 1.2 + np.sin(2 * np.pi * 120 * np.arange(n) / SR).astype(np.float32) * env_exp(n, 0.02) * 0.6)
        sfx.add(shot, t, 0.28, rng.uniform(-0.2, 0.2)); t += 1 / 38 * rng.uniform(0.85, 1.15)
rattle(C["gunner"] + 0.25, 0.7); rattle(C["gunner"] + 3.4, 0.9); rattle(C["gunner"] + 6.0, 0.5)
# the bomb: sound arrives a beat after the flash
hit, hangar = C["hit"], C["hangar"]
sfx.add(boom(1.2, 6), hit + 0.55, 0.9, -0.1)
sfx.add(boom(2.2, 10), hangar + 0.6, 1.2, 0.1)
fire = lp(noise(N), 500) * (0.6 + 0.4 * lp(np.abs(noise(N)), 4)) + bp(noise(N), 1200, 4000) * lp((np.abs(noise(N)) > 2.2).astype(np.float32), 400) * 3
sfx.mono(fire * ss(hangar + 1, hangar + 3, t_all) * (1 - ss(C["end"] + 2, C["end"] + 7, t_all)), 0.12)
for tm in C["misses"]:
    sfx.add(lp(boom(0.6, 3), 250), tm + 0.4, 0.4, 0.4)
    m = int(2.5 * SR); sfx.add(bp(noise(m), 400, 3000) * env_exp(m, 0.6), tm + 0.6, 0.12, 0.4)   # the column of water falling back

# ---------------- the music: drones, no tune ----------------
def braam(root, dur=5.0, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    x = np.zeros(n, np.float32)
    for m_, a in [(root, 1.0), (root + 12, 0.7), (root + 19, 0.45), (root + 13, 0.25)]:
        for det in (-0.12, 0.0, 0.11):
            f = mtof(m_ + det)
            x += (signal.sawtooth(2 * np.pi * f * t + rng.uniform(0, 6)) * a).astype(np.float32)
    x = lp(x, 900) + lp(x, 2200) * 0.25
    e = np.minimum(1, t / 0.06) * np.exp(-t / (dur * 0.4))
    return np.tanh(x * e * 0.25 * g).astype(np.float32)
music.add(braam(26, 6), 12.25, 0.55)           # "Carriers. Dead ahead."
music.add(braam(25, 7), push + 0.2, 0.7)       # the wing-over
music.add(braam(26, 5), C["deck"] + 1.1, 0.45) # the lookout's cry
# a low drone under everything, thickening
def drone(notes, t0, t1, g, cutoff):
    n = int((t1 - t0) * SR); t = np.arange(n) / SR; x = np.zeros(n, np.float32)
    for s in notes:
        for det in (-5, 0, 6):
            f = mtof(s) * 2 ** (det / 1200)
            ph = 2 * np.pi * f * t + rng.uniform(0, 6)
            for k in range(1, 9):
                if f * k > 6000: break
                x += (np.sin(k * ph) / k).astype(np.float32)
    x = lp(x, cutoff)
    e = np.clip(t / ((t1 - t0) * 0.6), 0, 1) ** 1.5 * np.clip((t1 - t0 - t) / 0.4, 0, 1)
    music.add(x * e.astype(np.float32) / len(notes), t0, g)
drone([26, 33], 0.0, rel - 0.1, 0.16, 400)
drone([38, 39, 45], 17.5, rel - 0.1, 0.10, 1400)
drone([62, 63, 64, 69], 33, rel - 0.1, 0.05, 3200)
# Shepard-Risset: a tone that climbs for the whole dive and never arrives
def shepard(t0, t1, g, rate=1 / 6.0):
    n = int((t1 - t0) * SR); tt = np.arange(n) / SR; x = np.zeros(n, np.float32)
    for k in range(8):
        pos = (k / 8 + tt * rate) % 1.0
        f = 55 * 2 ** (pos * 6)
        amp = np.exp(-((pos - 0.5) ** 2) / 0.05)
        ph = 2 * np.pi * np.cumsum(f) / SR
        x += (np.sin(ph) * amp).astype(np.float32)
    e = np.clip(tt / (t1 - t0), 0, 1) ** 1.2 * np.clip((t1 - t0 - tt) / 0.1, 0, 1)
    music.add(lp(x, 5000) * e.astype(np.float32), t0, g)
shepard(dive, rel - 0.1, 0.09)
# a sub-bass swell under the last ten seconds of the dive
tt = np.arange(int(10 * SR)) / SR
music.add((np.sin(2 * np.pi * 34 * tt) * (tt / 10) ** 2).astype(np.float32), rel - 10.1, 0.3)
# the reckoning: a low chord in the dark, and one last blow under the title
drone([26, 33, 41, 50], C["end"] - 1, T, 0.2, 2200)
tt = np.arange(int(6 * SR)) / SR
music.add((np.sin(2 * np.pi * 36.7 * tt) * np.exp(-tt / 2.2)).astype(np.float32) + lp(noise(len(tt)), 120) * np.exp(-tt / 1.0).astype(np.float32) * 0.5, C["end"] + 12.3, 0.55)
music.add(braam(26, 6, 0.8), C["end"] + 12.3, 0.4)

# the aftermath, from far off: wind over the water, and the dull thud of secondary explosions carried across the sea
AFT = shot_mask({"aftermath"}, 1.2)
gust = (0.65 + 0.35 * np.sin(2 * np.pi * 0.11 * t_all) * np.sin(2 * np.pi * 0.037 * t_all + 1.0)).astype(np.float32)
sfx.stereo(lp(hp(noise(N), 60), 700) * gust * AFT, lp(hp(noise(N), 60), 700) * gust * AFT, 0.035)
for dt, g, pan in [(3.4, 0.55, -0.1), (7.9, 0.4, 0.35), (10.4, 0.3, -0.4)]:
    n = int(3.5 * SR); tt = np.arange(n) / SR
    boom = lp(noise(n), 110) * np.exp(-tt / 0.8).astype(np.float32) * 1.4 + (np.sin(2 * np.pi * 29 * tt) * np.exp(-tt / 1.4)).astype(np.float32) * 0.7
    sfx.add(boom.astype(np.float32), C["end"] + dt, g, pan)

# ---------------- mix ----------------
irA, irB = ir(2.5, 0.6, 5000, 1), ir(2.5, 0.6, 5000, 2)
def verb(b, amt): return np.stack([b.L + fftconv(b.L, irA) * amt, b.R + fftconv(b.R, irB) * amt])
def norm(x, p): return x * (p / (np.percentile(np.abs(x), 99.95) or 1))
P, D, M, X, V = verb(plane, 0.05), verb(deck, 0.25), verb(music, 0.4), verb(sfx, 0.25), verb(voice, 0.08)
P, D, M, X, V = norm(P, 0.42), norm(D, 0.5), norm(M, 0.36), norm(X, 0.7), norm(V, 0.5)
mix = P + D + M + X + V
# the grey-out: blood leaves the ears too — everything goes dull and far away, except the heart and the grunting
g_out = ss(rel + 0.3, rel + 1.3, t_all) * (1 - ss(rel + 2.1, C["gunner"], t_all))
dull = np.stack([lp(mix[0], 350, 2), lp(mix[1], 350, 2)])
mix = mix * (1 - g_out) + (dull * 0.8) * g_out
# hard cut to black at the end of the gunner shot: only the fire and the drone carry over
mix[:, :int(0.6 * SR)] *= np.linspace(0, 1, int(0.6 * SR))
mix[:, -int(2.0 * SR):] *= np.linspace(1, 0, int(2.0 * SR))
# gentle limiter
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix = mix / np.max(np.abs(mix)) * 0.97
os.makedirs(BUILD, exist_ok=True)
wav = os.path.join(BUILD, "mix.wav")
sf.write(wav, mix.T, SR)
subprocess.check_call([ffmpeg(), "-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-15:TP=-1.2:LRA=14", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", os.path.join(BUILD, "mix.m4a")])
os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
subprocess.check_call([ffmpeg(), "-y", "-loglevel", "error", "-i", os.path.join(BUILD, "mix.m4a"), "-c", "copy", os.path.join(ROOT, "data", "mix.m4a")])
print("mix done", T)
