#!/usr/bin/env python3
"""ElevenLabs SFX for weapon batch 3 (pigeon, uzi, bow, quake, ...).
Run with ELEVENLABS_API_KEY in the environment (e.g. `set -a; . /home/sprite/tools/.env; set +a`)."""
import os, sys
sys.argv = [sys.argv[0]]
# reuse helpers without re-running the first batch
src = open(os.path.join(os.path.dirname(__file__), "genaudio.py")).read().split("jobs = []")[0]
exec(src)
from concurrent.futures import ThreadPoolExecutor
EXTRA = [
 ("pigeon",     "pigeon cooing followed by rapid wing flapping take-off, cartoon game sound effect", 1.5),
 ("uzi",        "short rapid submachine gun burst, cartoon game sound effect", 1.2),
 ("handgun",    "single punchy pistol gunshot, cartoon game sound effect", 0.6),
 ("bow",        "bow string twang with an arrow whooshing away, game sound effect", 0.8),
 ("arrow_hit",  "arrow thunking into wood and quivering, game sound effect", 0.6),
 ("dragonball", "crackling energy fireball charging and blasting forward with a whoosh, game sound effect, no voice", 1.2),
 ("kamikaze",   "comedic high pitched cartoon battle cry yell followed by a whoosh, game sound effect", 1.5),
 ("prod",       "cartoon finger poke with a springy boing, game sound effect", 0.5),
 ("axe",        "heavy axe chopping thunk with a metallic ring, game sound effect", 0.7),
 ("quake",      "deep rumbling earthquake with rocks cracking and shaking, game sound effect", 3.0),
 ("scales",     "magical shimmering chime with a balance scale clink, game sound effect", 1.2),
 ("drill",      "pneumatic jackhammer drilling into rock, rhythmic, game sound effect", 2.0),
 ("cow",        "comedic cartoon cow moo, game sound effect", 1.2),
 ("oldwoman",   "cartoon old lady grumbling and muttering while shuffling, comedic, game sound effect", 1.5),
 ("vase",       "porcelain vase shattering into pieces, game sound effect", 0.8),
 ("petrol",     "glass bottle smashing followed by a whoosh of fire igniting, game sound effect", 1.2),
 ("mortar",     "loud punchy mortar launch: a deep hollow boomy thump of a shell firing out of a metal tube, game sound effect", 0.8),
 ("napalm",     "big whoosh of fire spreading and crackling, game sound effect", 1.5),
]
with ThreadPoolExecutor(max_workers=3) as ex:
    for r in ex.map(lambda j: sfx(*j), EXTRA): print(r, flush=True)
print("AUDIO4 DONE")
