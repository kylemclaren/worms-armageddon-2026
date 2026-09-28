#!/usr/bin/env python3
"""Regenerate a single voice line until speech-to-text confirms it."""
import os, sys, json, uuid, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
voice_id, dest, must, bad = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
texts = sys.argv[5:]
def req(url, data, ctype):
    r = urllib.request.Request(url, data=data, headers={"xi-api-key": KEY, "Content-Type": ctype})
    with urllib.request.urlopen(r, timeout=120) as f: return f.read()
def stt(path):
    b = "----" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\nscribe_v1\r\n--{b}\r\n"
            f"Content-Disposition: form-data; name=\"file\"; filename=\"a.mp3\"\r\nContent-Type: audio/mpeg\r\n\r\n").encode() \
        + open(path, "rb").read() + f"\r\n--{b}--\r\n".encode()
    return json.loads(req("https://api.elevenlabs.io/v1/speech-to-text", body, f"multipart/form-data; boundary={b}"))["text"]
for t in texts:
    audio = req(f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128", json.dumps({
        "text": t, "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.6, "use_speaker_boost": True}}).encode(), "application/json")
    open(dest, "wb").write(audio)
    heard = stt(dest)
    print(f"tried {t!r} -> heard {heard!r}")
    if must in heard.lower() and bad not in heard.lower(): print("ACCEPTED"); break
else: print("NO VARIANT ACCEPTED")
