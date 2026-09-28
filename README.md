# Worms Armageddon 2026

A fan-made, browser-based tribute to Team17's 1999 classic: turn-based artillery on fully destructible terrain, playable against friends, a built-in CPU, or **Jev** (TypeSafe's decision model).

No build step: plain ES modules on a Canvas 2D renderer, served by a small Node server.

## Run it

```bash
node server.js            # http://localhost:8080
```

Optional environment (read from the process env or `../tools/.env`):

| Variable | Purpose |
|---|---|
| `TYPESAFE_BASE_URL` | Sprites gateway URL for TypeSafe (enables the Jev opponent, no key needed) |
| `TYPESAFE_API_KEY` | Alternative to the gateway: a raw TypeSafe key |
| `TIGRIS_ASSETS_BASE` | Sprites S3-gateway URL of the asset bucket; when set, `/assets/*` is served from Tigris with a local disk cache |
| `PORT` | Defaults to 8080 |

Without any of these the game runs fully offline from the files in `assets/`.

Add `?testmap` to the URL for the deterministic movement test course, and `?perf` (or press **F3**) for the frame-time overlay.

## What's in it

- **Destructible bitmap terrain** with procedural islands, caves and tunnels, baked lighting and drop shadows, and three themes (Rolling Hills, Red Planet, Frozen Wastes).
- **23 weapons and utilities**, including bazooka, homing missile, grenade, cluster bomb, banana bomb, Holy Hand Grenade, shotgun, minigun, fire punch, baseball bat, dynamite, mines, sheep, air strike, Armageddon, Concrete Donkey, ninja rope, jet pack, teleport, girder, blowtorch, skip go and surrender.
- **Turn rules from the original**: wind, retreat time, fall damage, drowning, crates on parachutes, oil drums, sudden death with rising water.
- **Opponents**:
  - The CPU brute-forces candidate shots with the game's own physics and then plays them with skill-based aiming error.
  - Jev picks among those simulated moves, and chooses a taunt, through the TypeSafe API.
- **Animated worms** from a 15-frame sprite atlas: idle and blink, inchworm walk, crouch, jump, fall, tumble and dizzy. The worms tilt to the slope under them, walk slower uphill, and each frame is pre-scaled to its exact device size so they stay crisp at any zoom.
- **Layered parallax backdrops** with depth-of-field, composited by the GPU, plus an adaptive graphics tier (Auto/High/Medium/Low).
- **Audio** from ElevenLabs: 40 sound effects, three worm voice banks and an announcer.

## Layout

```
index.html, css/, js/        the game (entry: js/main.js)
server.js                    static server + Jev proxy + Tigris-backed assets + telemetry
assets/gfx, assets/audio     game-ready art and sound
tools/                       asset pipeline
  prep_images.py             cut out and resize generated sprites
  prep_bg.py                 chroma-key parallax planes, add atmospheric depth
  slice_sheet.py             split an animation sheet into frames
  build_worm_atlas.py        pack worm frames into worm_atlas.{png,json}
  upscale.py                 Real-ESRGAN (anime model) tiled upscaler via onnxruntime
  sync_tigris.py             incremental upload of assets to the Tigris bucket
  verify_audio.py            speech-to-text check of every voice line
  walk_metrics.py            movement-quality metrics for the ?testmap course
  gen/                       the image-use and ElevenLabs generation scripts used
```

## Credits

- Art generated with [image-use](https://github.com/leeguooooo/image-use) and upscaled with Real-ESRGAN.
- Voices and sound effects by [ElevenLabs](https://elevenlabs.io).
- Opponent decisions by [TypeSafe Jev](https://typesafe.ai).

Worms and Worms Armageddon are trademarks of Team17. This is a non-commercial fan project and is not affiliated with Team17.
