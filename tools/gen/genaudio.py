#!/usr/bin/env python3
"""Generate all Worms Armageddon web audio via ElevenLabs."""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["ELEVENLABS_API_KEY"]
OUT = "/home/sprite/worms/assets/audio"
os.makedirs(OUT + "/sfx", exist_ok=True)
os.makedirs(OUT + "/voice", exist_ok=True)

def post(url, payload, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 2000:
        return f"skip {os.path.basename(dest)}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
        headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            if len(data) < 1000:
                return f"TINY {dest} {len(data)}"
            with open(dest, "wb") as f:
                f.write(data)
            return f"ok {os.path.basename(dest)} {len(data)}B"
        except urllib.error.HTTPError as e:
            body = e.read()[:200]
            if e.code in (429, 500, 502, 503):
                time.sleep(3 + attempt * 4); continue
            return f"FAIL {os.path.basename(dest)} {e.code} {body}"
        except Exception as e:
            time.sleep(2 + attempt * 3)
            if attempt == 3: return f"FAIL {os.path.basename(dest)} {e}"
    return f"FAIL {os.path.basename(dest)} retries"

SFX_URL = "https://api.elevenlabs.io/v1/sound-generation"
def sfx(name, prompt, dur, influence=0.7):
    return post(SFX_URL, {"text": prompt, "duration_seconds": dur,
                          "prompt_influence": influence}, f"{OUT}/sfx/{name}.mp3")

TTS = "https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=mp3_44100_128"
def tts(voice_id, name, text, folder, stability=0.35, style=0.65):
    return post(TTS.format(voice_id), {
        "text": text, "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": stability, "similarity_boost": 0.8,
                           "style": style, "use_speaker_boost": True}},
        f"{OUT}/voice/{folder}/{name}.mp3")

SFX = [
 ("explosion_big",   "huge cartoon explosion boom with debris scattering, video game sound effect, no music", 2.2),
 ("explosion_med",   "medium cartoon grenade explosion thud with dirt spray, video game sound effect", 1.6),
 ("explosion_small", "small quick cartoon pop explosion, video game sound effect", 1.0),
 ("bazooka_fire",    "rocket launcher whoosh firing a missile, punchy game sound effect", 1.2),
 ("shotgun",         "loud shotgun blast with pump cocking action, game sound effect", 1.4),
 ("minigun",         "rapid gatling minigun burst of gunfire, game sound effect", 1.8),
 ("grenade_bounce",  "small metal object bouncing once on hard dirt ground, short clean thud, game sound effect", 0.8),
 ("fuse",            "hissing burning fuse sparking, looping, game sound effect", 2.0),
 ("splash",          "big water splash plunge, cartoon game sound effect", 1.4),
 ("jump",            "short cartoon boing hop jump, game sound effect", 0.7),
 ("thud",            "body landing hard on dirt, dull cartoon thud, game sound effect", 0.7),
 ("teleport",        "magical sci-fi teleport warp whoosh with sparkle shimmer, game sound effect", 1.5),
 ("crate_drop",      "parachute supply crate landing softly with a wooden clunk, game sound effect", 1.2),
 ("collect",         "bright cheerful pickup chime collect item, game sound effect", 0.9),
 ("mine_beep",       "electronic proximity mine beeping warning, three quick beeps, game sound effect", 1.2),
 ("airplane",        "small propeller biplane flying past overhead, game sound effect", 2.5),
 ("holy",            "angelic choir singing a short heavenly hallelujah chord, game sound effect", 2.5),
 ("girder",          "heavy metal steel beam clanging into place, game sound effect", 1.0),
 ("firepunch",       "cartoon whoosh uppercut punch with a flame burst, game sound effect", 0.9),
 ("jetpack",         "jetpack rocket thruster hissing burn, looping, game sound effect", 2.0),
 ("dig",             "digging into dirt with a fast drill blowtorch, looping, game sound effect", 1.5),
 ("turn_start",      "short bright UI chime notification ding, game sound effect", 0.7),
 ("timer_tick",      "single soft clock tick, game sound effect", 0.5),
 ("sudden_death",    "ominous low rumbling alarm drone warning sting, game sound effect", 2.5),
 ("victory",         "triumphant short cartoon fanfare celebration jingle", 3.0),
 ("wind",            "gentle looping wind blowing across an open field, ambient", 4.0),
 ("select",          "soft UI click button select blip, game sound effect", 0.5),
 ("skip",            "quick cartoon whoosh swipe transition, game sound effect", 0.6),
 ("drown",           "gurgling underwater bubbles sinking, cartoon game sound effect", 1.6),
 ("banana",          "silly cartoon boing splat comedy sound effect", 1.0),
]

# British-ish voices, pitched up in-browser for the squeaky worm effect.
BANKS = {"a": "JBFqnCBsd6RMkjVDRZzb",  # George - british male
         "b": "onwK4e9ZLuTAKqWW03F9",  # Daniel - british male
         "c": "Xb7hH8MSUJpSbSDYk0k2"}  # Alice  - british female

LINES = {
 "fire": "Fire!", "incoming": "Incoming!", "ouch": "Ouch!", "ohdear": "Oh dear.",
 "watchthis": "Watch this!", "takecover": "Take cover!", "missed": "Missed!",
 "revenge": "Revenge!", "hello": "Hello!", "byebye": "Bye bye!",
 "victory": "Victory!", "nooo": "Nooo!", "comeonthen": "Come on then!",
 "uhoh": "Uh oh.", "yessir": "Yes sir!", "excellent": "Excellent!",
 "laugh": "Ha ha ha!", "coward": "Coward!", "traitor": "Traitor!",
 "boring": "Boring!", "leavemealone": "Leave me alone!", "grenade": "Grenade!",
 "fatality": "Fatality!", "ooof": "Ooof!", "stupid": "Stupid!",
}

ANN = {  # announcer, deep, normal pitch
 "ann_battle": "Let battle commence!",
 "ann_sudden": "Sudden death!",
 "ann_timeup": "Time's up!",
 "ann_round": "Round over.",
 "ann_reinf": "Reinforcements!",
 "ann_wins": "The winner is...",
 "ann_draw": "It's a draw!",
 "ann_crate": "Crate drop!",
}

jobs = []
for n, p, d in SFX:
    jobs.append(("sfx", n, p, d))
for b in BANKS:
    os.makedirs(f"{OUT}/voice/{b}", exist_ok=True)
os.makedirs(f"{OUT}/voice/ann", exist_ok=True)

def run_sfx(j):
    return sfx(j[1], j[2], j[3])

def run_voice(t):
    bank, name, text = t
    if bank == "ann":
        return tts("pqHfZKP75CvOlQylNhV4", name, text, "ann", 0.5, 0.5)  # Bill - wise mature
    return tts(BANKS[bank], name, text, bank, 0.3, 0.75)

vjobs = [(b, n, t) for b in BANKS for n, t in LINES.items()]
vjobs += [("ann", n, t) for n, t in ANN.items()]

with ThreadPoolExecutor(max_workers=3) as ex:
    for r in ex.map(run_sfx, jobs):
        print(r, flush=True)
with ThreadPoolExecutor(max_workers=4) as ex:
    for r in ex.map(run_voice, vjobs):
        print(r, flush=True)
print("AUDIO DONE", flush=True)
