#!/usr/bin/env python3
"""Extra ElevenLabs audio for the second weapon batch + menu music."""
import os, sys
sys.argv = [sys.argv[0]]
# reuse helpers without re-running the first batch
src = open(os.path.join(os.path.dirname(__file__), "genaudio.py")).read().split("jobs = []")[0]
exec(src)
from concurrent.futures import ThreadPoolExecutor
EXTRA = [
 ("sheep",       "cartoon sheep bleating baa, single funny bleat, game sound effect", 1.0),
 ("rope",        "grappling hook rope shooting out and latching with a metallic thwip clink, game sound effect", 0.8),
 ("bat",         "wooden baseball bat hitting with a big comedic whack, game sound effect", 0.8),
 ("homing_lock", "electronic missile target lock-on beep beep beeeep, game sound effect", 1.0),
 ("armageddon",  "meteors screaming down from the sky with rumbling fiery impacts, apocalyptic, game sound effect", 3.5),
 ("donkey",      "donkey hee-haw bray followed by heavy stone crash, comedic game sound effect", 2.0),
 ("surrender",   "sad trombone wah wah wah waaah, comedic", 2.0),
 ("walk",        "tiny squishy cartoon worm shuffling footsteps, short, game sound effect", 0.6),
 ("whoosh",      "fast air whoosh of an object flying past, game sound effect", 0.6),
 ("barrel",      "metal oil drum exploding with a whoomp fireball, game sound effect", 1.8),
]
with ThreadPoolExecutor(max_workers=3) as ex:
    for r in ex.map(lambda j: sfx(*j), EXTRA): print(r, flush=True)

# Menu theme. Music endpoint returns mp3 bytes.
print(post("https://api.elevenlabs.io/v1/music", {
  "prompt": "Upbeat quirky military march for a cartoon artillery video game title screen, "
            "snare drum rolls, tuba, brass fanfare, playful and cheeky, British comedy, instrumental, loopable",
  "music_length_ms": 60000}, f"{OUT}/music_menu.mp3"), flush=True)
print(post("https://api.elevenlabs.io/v1/music", {
  "prompt": "Light tense ambient battle underscore for a cartoon artillery strategy game, sparse pizzicato strings, "
            "soft snare, subtle whimsical woodwinds, low intensity background music, instrumental, loopable",
  "music_length_ms": 90000}, f"{OUT}/music_battle.mp3"), flush=True)
print("AUDIO3 DONE")
