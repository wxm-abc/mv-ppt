#!/usr/bin/env python3
"""Probe a song file before it is used as the clock of a code-rendered video.

Answers the questions that decide whether a given audio file can drive a film that was
timed on a *different* copy of the same track:

  * how long is it, and where does the sound actually start and end?
  * is the head silence the same as the reference copy's (that difference IS the offset)?
  * is the file a different master entirely (much longer / shorter, or a bad transcode)?

Usage:
    python song_probe.py AUDIO [--ffmpeg PATH] [--expect-sec 211.96]
                               [--ref-lead 0.183] [--json]

    --expect-sec   duration of the copy the film was timed on (optional)
    --ref-lead     head silence of that copy, in seconds (optional)
                   -> prints the suggested timing.offset = your_lead - ref_lead
    --json         machine-readable output

Only needs ffmpeg (on PATH, or via --ffmpeg) and the Python standard library.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import struct
import subprocess
import sys
import tempfile

SR = 44100          # analysis rate
WIN = 441           # 10 ms window
FLOOR_DB = -60.0    # below peak: treated as silence


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, **kw)


def find_ffmpeg(explicit: str | None) -> str:
    if explicit:
        return explicit
    if os.environ.get("FFMPEG_BIN"):
        return os.environ["FFMPEG_BIN"]
    from shutil import which
    w = which("ffmpeg")
    if w:
        return w
    sys.exit("ffmpeg not found: install it, pass --ffmpeg PATH, or set FFMPEG_BIN")


def to_pcm(ff: str, src: str) -> bytes:
    """Decode to mono float32 at SR. Returns raw bytes; the file is deleted afterwards."""
    fd, tmp = tempfile.mkstemp(suffix=".f32")
    os.close(fd)
    try:
        r = sh([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", src,
                "-ac", "1", "-ar", str(SR), "-c:a", "pcm_f32le", "-f", "f32le", tmp])
        if r.returncode != 0:
            sys.exit(f"ffmpeg could not decode {src}:\n{r.stderr.decode(errors='replace')}")
        with open(tmp, "rb") as f:
            return f.read()
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def analyse(pcm: bytes) -> dict:
    n = len(pcm) // 4
    if n == 0:
        sys.exit("decoded audio is empty")
    unpack = struct.Struct("<%df" % min(n, 1 << 16)).unpack_from

    peak = 0.0
    peaks = []          # per-window absolute peak
    for off in range(0, n, WIN):
        m = min(WIN, n - off)
        vals = unpack(pcm, off * 4) if m == (1 << 16) else struct.unpack_from("<%df" % m, pcm, off * 4)
        mx = 0.0
        for v in vals:
            a = v if v >= 0 else -v
            if a > mx:
                mx = a
        if mx > peak:
            peak = mx
        peaks.append(mx)

    floor = peak * (10 ** (FLOOR_DB / 20.0))
    def first_above(i0, i1, step):
        for i in range(i0, i1, step):
            if peaks[i] > floor:
                return i
        return -1

    a = first_above(0, len(peaks), 1)
    b = first_above(len(peaks) - 1, -1, -1)
    return {
        "duration": round(n / SR, 3),
        "peak_dbfs": round(20 * math.log10(peak), 2) if peak > 0 else -99.0,
        "content_start": round(a * WIN / SR, 3) if a >= 0 else None,
        "content_end": round((b + 1) * WIN / SR, 3) if b >= 0 else None,
        "head_silence": round(a * WIN / SR, 3) if a >= 0 else None,
        "tail_silence": round(n / SR - (b + 1) * WIN / SR, 3) if b >= 0 and b + 1 < len(peaks) else 0.0,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--ffmpeg")
    ap.add_argument("--expect-sec", type=float, help="duration of the copy the film was timed on")
    ap.add_argument("--ref-lead", type=float, help="head silence of that copy (s)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    ff = find_ffmpeg(a.ffmpeg)
    info = analyse(to_pcm(ff, a.audio))
    info["file"] = os.path.basename(a.audio)

    verdict = []
    if a.expect_sec is not None:
        d = info["duration"] - a.expect_sec
        info["delta_vs_expected"] = round(d, 3)
        verdict.append(f"duration differs from the reference by {d:+.2f}s")
        if abs(d) > 1.5:
            verdict.append("LIKELY A DIFFERENT MASTER - a single offset will not fix drift")
    if a.ref_lead is not None and info["head_silence"] is not None:
        off = round(info["head_silence"] - a.ref_lead, 3)
        info["suggested_offset"] = off
        verdict.append(f"suggested timing.offset = {off:+.3f}s (positive = picture plays later)")

    if a.json:
        print(json.dumps(info, ensure_ascii=False, indent=2))
        return

    print(f"file            {info['file']}")
    print(f"duration        {info['duration']:.3f} s")
    print(f"peak            {info['peak_dbfs']:.2f} dBFS")
    print(f"sound starts    {info['content_start']} s   (head silence {info['head_silence']} s)")
    print(f"sound ends      {info['content_end']} s   (tail silence {info['tail_silence']} s)")
    for v in verdict:
        print(f"-> {v}")
    if not verdict:
        print("-> pass --expect-sec / --ref-lead to compare against the reference copy")


if __name__ == "__main__":
    main()
