#!/usr/bin/env python3
"""Verify generated audio: transcribe every voice line with ElevenLabs STT and
compare against the intended text; report SFX durations/loudness."""
import os, json, re, uuid, urllib.request
from concurrent.futures import ThreadPoolExecutor
from mutagen.mp3 import MP3
KEY = os.environ["ELEVENLABS_API_KEY"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets/audio")
src = open(os.path.join(ROOT, "tools/gen/genaudio.py")).read()
LINES = eval(re.search(r"LINES = (\{.*?\n\})", src, re.S).group(1))
ANN = eval(re.search(r"ANN = (\{.*?\n\})", src, re.S).group(1))

def stt(path):
    b = "----" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\nscribe_v1\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n").encode() \
        + open(path, "rb").read() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request("https://api.elevenlabs.io/v1/speech-to-text", data=body,
        headers={"xi-api-key": KEY, "Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return json.load(r).get("text", "")
    except Exception as e: return f"ERR {e}"

norm = lambda s: re.sub(r"[^a-z ]", "", s.lower().replace("-", " ")).split()
jobs = [(f"{A}/voice/{b}/{n}.mp3", t) for b in "abc" for n, t in LINES.items()]
jobs += [(f"{A}/voice/ann/{n}.mp3", t) for n, t in ANN.items()]
def check(j):
    p, want = j
    got = stt(p)
    w, g = norm(want), norm(got)
    ok = bool(w) and all(any(x.startswith(y[:3]) or y.startswith(x[:3]) for y in g) for x in w)
    return ok, os.path.relpath(p, A), want, got, MP3(p).info.length
bad = 0
with ThreadPoolExecutor(6) as ex:
    for ok, p, want, got, dur in ex.map(check, jobs):
        if not ok: bad += 1
        print(("OK  " if ok else "BAD ") + f"{p:28s} {dur:4.1f}s want={want!r} got={got!r}", flush=True)
print(f"VOICE: {len(jobs)-bad}/{len(jobs)} ok")
for f in sorted(os.listdir(f"{A}/sfx")):
    m = MP3(f"{A}/sfx/{f}")
    print(f"SFX {f:22s} {m.info.length:4.1f}s {os.path.getsize(f'{A}/sfx/{f}')}B")
