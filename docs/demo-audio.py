#!/usr/bin/env python3
"""合成 README 预览 GIF 用的 8 秒演示音轨。

为什么是合成而不是找素材：这样音轨的版权 100% 属于仓库作者，不存在
「这个 CC0 到底能不能商用」「署名格式对不对」的后患。脚本随仓库发布，
任何人跑一遍都能得到逐样本相同的 wav。

120 BPM × 4 小节 = 8.0 秒，正好够 4 个镜头、每镜 1 小节。

    调性  D 小调，四小节循环 Dm - B♭ - F - C
    织体  慢起音的和声垫 + 每拍一记木质脉冲 + 小节头一枚钟音
    声像  和声垫各声部左右分开，脉冲居中
    混响  三梳状 + 一全通（Schroeder），湿声 22%

用法：
    python demo-audio.py out.wav
"""
import array
import math
import random
import struct
import sys
import wave

SR = 44100
BPM = 120
BEAT = 60.0 / BPM          # 0.5 s
BAR = 4 * BEAT             # 2.0 s
BARS = 4
DUR = BAR * BARS           # 8.0 s
N = int(SR * DUR)
TAU = 2 * math.pi

# 每小节的四个声部（根音 / 五度 / 八度 / 三音），频率单位 Hz
CHORDS = [
    [146.83, 220.00, 293.66, 349.23],   # Dm
    [116.54, 174.61, 233.08, 293.66],   # Bb
    [ 87.31, 130.81, 174.61, 220.00],   # F
    [130.81, 196.00, 261.63, 329.63],   # C
]

L = [0.0] * N
R = [0.0] * N


def rc_fade(x, length):
    """升余弦淡入淡出，避免爆音。"""
    return 0.5 - 0.5 * math.cos(math.pi * min(1.0, x / length))


def pad(f0, t0, t1, amp, pan, detune_cents=0.0):
    """慢起音和声垫：正弦 + 微弱二次谐波，带 0.55 Hz 颤音。"""
    f = f0 * (2 ** (detune_cents / 1200.0))
    i0, i1 = max(0, int(t0 * SR)), min(N, int(t1 * SR))
    gl, gr = math.sqrt(1 - pan), math.sqrt(pan)
    a, r = 0.70, 0.90                       # 起音 / 释放（秒）
    for i in range(i0, i1):
        t = i / SR - t0
        e = min(rc_fade(t, a), rc_fade((t1 - t0) - t, r))
        if e <= 0.0:
            continue
        vib = 1.0 + 0.0016 * math.sin(TAU * 0.55 * t)
        s = math.sin(TAU * f * vib * t) + 0.22 * math.sin(TAU * 2 * f * vib * t)
        s *= amp * e
        L[i] += s * gl
        R[i] += s * gr


def pluck(t0, amp, pan, f=95.0, tau=0.045):
    """木质脉冲：低频正弦 + 一小段噪声瞬态，指数衰减。"""
    i0, i1 = int(t0 * SR), min(N, int((t0 + 0.16) * SR))
    gl, gr = math.sqrt(1 - pan), math.sqrt(pan)
    rnd = random.Random(1234)
    for i in range(i0, i1):
        t = (i - i0) / SR
        env = math.exp(-t / tau)
        s = math.sin(TAU * f * t) * env
        if t < 0.006:                        # 起振的一点点噪声，给它"木头感"
            s += (rnd.random() * 2 - 1) * (1 - t / 0.006) * 0.35
        s *= amp
        L[i] += s * gl
        R[i] += s * gr


def bell(t0, f, amp, pan, tau=0.34):
    """小节头的钟音：两个不成整数比的分音，听起来才不像纯正弦。"""
    i0, i1 = int(t0 * SR), min(N, int((t0 + 1.2) * SR))
    gl, gr = math.sqrt(1 - pan), math.sqrt(pan)
    for i in range(i0, i1):
        t = (i - i0) / SR
        s = (math.sin(TAU * f * t) * math.exp(-t / tau)
             + 0.5 * math.sin(TAU * f * 2.76 * t) * math.exp(-t / (tau * 0.55)))
        s *= amp * min(1.0, t / 0.004)
        L[i] += s * gl
        R[i] += s * gr


# ---- 编排 -------------------------------------------------------------------
PANS = [0.30, 0.62, 0.44, 0.74]            # 四个声部摊开在声场里
for b in range(BARS):
    t0 = b * BAR
    chord = CHORDS[b]
    for k, f in enumerate(chord):
        det = (-4.0, 3.0, -2.0, 5.0)[k]     # 轻微失谐，比齐奏暖
        pad(f, t0 - 0.12, t0 + BAR + 0.38, 0.085 if k else 0.105, PANS[k], det)
    bell(t0, chord[0] * 4, 0.045, 0.70 if b % 2 else 0.28)
    for beat in range(4):
        tb = t0 + beat * BEAT
        pluck(tb, 0.20 if beat == 0 else 0.115, 0.50)


# ---- 混响（Schroeder：并联梳状 + 串联全通）-----------------------------------
def comb(x, delay_s, fb):
    d = int(delay_s * SR)
    buf = [0.0] * d
    p, out = 0, [0.0] * len(x)
    for i, v in enumerate(x):
        y = buf[p]
        buf[p] = v + y * fb
        out[i] = y
        p = (p + 1) % d
    return out


def allpass(x, delay_s, g=0.5):
    d = int(delay_s * SR)
    buf = [0.0] * d
    p, out = 0, [0.0] * len(x)
    for i, v in enumerate(x):
        b = buf[p]
        y = -g * v + b
        buf[p] = v + g * y
        out[i] = y
        p = (p + 1) % d
    return out


def reverb(chan, spread):
    acc = [0.0] * len(chan)
    for ds, fb in ((0.0297, 0.72), (0.0371, 0.70), (0.0411, 0.68)):
        c = comb(chan, ds + spread, fb)
        for i, v in enumerate(c):
            acc[i] += v / 3.0
    return allpass(allpass(acc, 0.0050 + spread, 0.5), 0.0017, 0.5)


WL, WR = reverb(L, 0.0), reverb(R, 0.0007)   # 左右用不同延迟，声场才不是一个点

WET = 0.22
FADE_IN, FADE_OUT = 0.18, 0.75
frames = array.array("h")
for i in range(N):
    t = i / SR
    gl = rc_fade(t, FADE_IN) if t < FADE_IN else 1.0
    gr = rc_fade(DUR - t, FADE_OUT) if t > DUR - FADE_OUT else 1.0
    g = gl * gr
    l = (L[i] + WL[i] * WET) * g
    r = (R[i] + WR[i] * WET) * g
    l, r = math.tanh(l * 1.6), math.tanh(r * 1.6)       # 软限幅，避免削顶
    frames.append(int(max(-1.0, min(1.0, l)) * 32000))
    frames.append(int(max(-1.0, min(1.0, r)) * 32000))

out = sys.argv[1] if len(sys.argv) > 1 else "song.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(frames.tobytes())

print(f"{out}: {DUR:.1f}s / {BPM} BPM / 立体声 / {SR} Hz")
