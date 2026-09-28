#!/bin/zsh
# Marine life sprites (transparent), matched to the worm/props style.
IU=(/usr/bin/python3 /home/sprite/tools/image-use/image-use)
OUT=/home/sprite/worms/assets/raw8
LOG=/home/sprite/worms/genimg9.log
STYLE="cute polished modern 2D cartoon game sprite matching Worms Armageddon style: crisp clean dark outline, soft cel shading with a gentle rim light, vibrant colours, side view facing RIGHT, single creature centred with generous margin, transparent background, no water, no bubbles, no shadow, no text"
gen() { local f="$OUT/$1.png"; [[ -s "$f" ]] && return; echo "START $1" >> $LOG
  timeout 480 $IU "$2, $STYLE" -o "$f" --size 1024x1024 --background transparent --format png --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG; }
gen fish_orange "A small chubby orange and white striped reef fish with big friendly eyes" &
gen fish_blue "A small sleek blue tang fish with a yellow tail and big friendly eyes" &
gen fish_yellow "A small round yellow pufferfish-like fish with big friendly eyes" &
gen jellyfish "A cute translucent pink jellyfish with a glowing dome and wavy tentacles, facing the viewer" &
wait
gen turtle "A cute green sea turtle swimming with flippers spread" &
gen alienfish "A cute glowing cyan and violet alien fish with bioluminescent spots and long fins" &
gen whale "A cute small blue whale with a big smile, whole body visible" &
wait
echo ALLDONE >> $LOG
