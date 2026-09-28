#!/bin/zsh
IU="/usr/bin/python3 /home/sprite/tools/image-use/image-use"
OUT=/home/sprite/worms/assets/raw4
LOG=/home/sprite/worms/genimg5.log
gen() {
  local f="$OUT/$1.png"
  [[ -s "$f" ]] && { echo "skip $1" >> $LOG; return; }
  echo "START $1" >> $LOG
  timeout 480 ${=IU} "$3" -o "$f" --size "$2" --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG
}
WORM="the classic Worms Armageddon earthworm character: a glossy salmon-pink segmented worm with a big round head, two huge white googly eyes with black pupils sitting on the front top of the head, a cheeky smile, S-curved body ending in a curled tail, no arms, no hair, no clothes, no hat. Polished modern 2D game sprite art: crisp clean dark outline, soft cel shading with a warm rim light, very high detail, consistent character in every frame, all frames facing RIGHT"
GS="on one perfectly flat solid pure green (#00FF00) background with no shadows, no ground line, no text, no labels, no grid lines, generous empty space between frames"
lane1() {
  gen worm_sheet_a 1536x1024 "A game animation sprite sheet of $WORM. Three rows of five evenly spaced frames, feet aligned on a common baseline per row. Row 1: idle breathing loop, the 5th frame blinking with eyes closed. Row 2: inchworm walk cycle, from lying stretched out flat, to the body arching up in a hump, to a tall arch, back to flat. Row 3: crouching squashed ready to jump, stretched tall jumping upward, falling with a worried face, tumbling curled into a ball, dizzy hurt face. $GS"
}
lane2() {
  gen worm_sheet_b 1536x1024 "A game animation sprite sheet of $WORM. Three rows of five evenly spaced frames, feet aligned on a common baseline per row. Row 1: idle breathing loop, the 5th frame blinking with eyes closed. Row 2: inchworm walk cycle, from lying stretched out flat, to the body arching up in a hump, to a tall arch, back to flat. Row 3: crouching squashed ready to jump, stretched tall jumping upward, falling with a worried face, tumbling curled into a ball, dizzy hurt face. $GS"
}
lane3() {
  gen parachute 1024x1024 "A single cartoon supply parachute canopy seen from the side: a dome of red and white alternating panels with a small vent at the top, six thin ropes converging to one point at the bottom centre, nothing attached, polished modern 2D game sprite art with crisp clean dark outline and soft shading, on one perfectly flat solid pure green (#00FF00) background, no shadow, no text"
}
lane1 & lane2 & lane3 & wait
echo ALLDONE >> $LOG
