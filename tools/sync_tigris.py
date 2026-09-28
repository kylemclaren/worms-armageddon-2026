#!/usr/bin/env python3
"""Mirror the public game assets (assets/gfx, assets/audio) into the Tigris bucket
through the Sprites S3 gateway. Only uploads files whose MD5 differs from the
object's ETag, so re-running is cheap.  usage: sync_tigris.py [--dry-run]"""
import hashlib, os, re, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.environ.get("TIGRIS_ASSETS_BASE", "").rstrip("/")
if not BASE: sys.exit("TIGRIS_ASSETS_BASE not set (Sprites gateway URL of the S3 connector)")
DRY = "--dry-run" in sys.argv
TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".json": "application/json"}


def remote_index():
    out, token = {}, None
    while True:
        q = {"list-type": "2", "max-keys": "1000", "prefix": "assets/"}
        if token: q["continuation-token"] = token
        with urllib.request.urlopen(f"{BASE}/?{urllib.parse.urlencode(q)}", timeout=60) as r:
            xml = r.read().decode()
        for key, etag in re.findall(r"<Key>(.*?)</Key><ETag>&#34;([0-9a-f]+)&#34;</ETag>", xml):
            out[key] = etag
        m = re.search(r"<NextContinuationToken>(.*?)</NextContinuationToken>", xml)
        if "<IsTruncated>true</IsTruncated>" not in xml or not m: return out
        token = m.group(1)


def local_files():
    for sub in ("assets/gfx", "assets/audio"):
        for dirpath, _, files in os.walk(os.path.join(ROOT, sub)):
            for f in files:
                if os.path.splitext(f)[1] in TYPES:
                    p = os.path.join(dirpath, f)
                    yield os.path.relpath(p, ROOT).replace(os.sep, "/"), p


def put(key, path):
    data = open(path, "rb").read()
    req = urllib.request.Request(f"{BASE}/{urllib.parse.quote(key)}", data=data, method="PUT",
                                 headers={"Content-Type": TYPES[os.path.splitext(path)[1]]})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return f"put {key} ({len(data) // 1024} KB) {r.status}"
        except Exception as e:
            if attempt == 3: return f"FAIL {key}: {e}"


remote = remote_index()
todo = []
for key, path in local_files():
    md5 = hashlib.md5(open(path, "rb").read()).hexdigest()
    if remote.get(key) != md5: todo.append((key, path))
print(f"{len(remote)} objects in bucket, {len(todo)} to upload{' (dry run)' if DRY else ''}", flush=True)
if not DRY:
    with ThreadPoolExecutor(8) as ex:
        for line in ex.map(lambda kp: put(*kp), todo):
            if line.startswith("FAIL"): print(line, flush=True)
    print("done", flush=True)
