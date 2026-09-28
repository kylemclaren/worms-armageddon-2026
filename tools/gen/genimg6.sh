#!/bin/zsh
# Worm sheet v2: same layout, native transparent background (honoured on the codex path).
IU=(/usr/bin/python3 /home/sprite/tools/image-use/image-use)
OUT=/home/sprite/worms/assets/raw5
LOG=/home/sprite/worms/genimg6.log
WORM="the classic Worms Armageddon earthworm character: a glossy salmon-pink segmented worm with a big round head, two huge white googly eyes with black pupils sitting on the front top of the head, a cheeky smile, S-curved body ending in a curled tail, no arms, no hair, no clothes, no hat. Polished modern 2D game sprite art: crisp clean dark outline, soft cel shading with a warm rim light, very high detail, the exact same character in every frame, all frames facing RIGHT"
PROMPT="A game animation sprite sheet of $WORM. Three rows of five evenly spaced frames with generous empty space between frames, feet aligned on a common baseline per row. Row 1: idle breathing loop, the 5th frame blinking with eyes closed. Row 2: inchworm walk cycle, from lying stretched out flat, to the body arching up in a hump, to a tall arch, back to flat. Row 3: crouching squashed ready to jump, stretched tall jumping upward, falling with a worried face, tumbling curled into a ball, dizzy hurt face. Transparent background, no ground line, no shadows, no glow, no text, no labels, no grid lines."
gen() { echo "START $1" >> $LOG; timeout 480 $IU "$PROMPT" -o "$OUT/$1.png" --size 1536x1024 --background transparent --format png --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG; }
gen worm_sheet_t1 & gen worm_sheet_t2 & wait
echo ALLDONE >> $LOG
