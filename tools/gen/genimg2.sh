#!/bin/zsh
# Second batch: iconic weapons + terrain props. Raw output goes to assets/raw.
IU="/usr/bin/python3 /home/sprite/tools/image-use/image-use"
OUT=/home/sprite/worms/assets/raw
LOG=/home/sprite/worms/genimg2.log
gen() {
  local f="$OUT/$1.png"
  [[ -s "$f" ]] && { echo "skip $1" >> $LOG; return; }
  echo "START $1" >> $LOG
  timeout 420 ${=IU} "$3" -o "$f" --size "$2" --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG
}
ICON="game UI icon, single object centered, thick black outline, flat cel-shaded cartoon style like a 1999 Team17 Worms game, vivid saturated colors, plain solid white background, generous margin, no text, no shadow on background"
PROP="single game terrain decoration prop, side view, thick black outline, flat cel-shaded cartoon style like a 1999 Team17 Worms game, plain solid white background, generous margin, no ground, no text"
lane1() {
  gen icon_sheep 1024x1024 "A fluffy white cartoon sheep with black face and legs, side view facing right, with a stick of dynamite strapped to its back, $ICON"
  gen icon_rope 1024x1024 "A coiled ninja grappling rope with a steel grappling hook, $ICON"
  gen icon_homing 1024x1024 "A red and white homing missile with a glowing blue targeting seeker nose, flying up-right, $ICON"
  gen icon_bat 1024x1024 "A wooden baseball bat swinging with motion lines, $ICON"
}
lane2() {
  gen icon_armageddon 1024x1024 "Flaming meteors raining down from a red sky onto a tiny planet, apocalyptic, $ICON"
  gen icon_blowtorch 1024x1024 "A handheld blowtorch with a bright blue and orange flame shooting right, $ICON"
  gen icon_surrender 1024x1024 "A white surrender flag on a wooden stick waving, $ICON"
  gen icon_donkey 1024x1024 "A grey concrete statue of a donkey, heavy and chunky, $ICON"
}
lane3() {
  gen prop_tree 1024x1024 "A gnarled cartoon tree with a thick brown trunk and a round bushy green canopy, $PROP"
  gen prop_rock 1024x1024 "A large grey cartoon boulder rock pile, $PROP"
  gen prop_crystal 1024x1024 "A cluster of glowing magenta and cyan alien crystals, $PROP"
  gen prop_snowman 1024x1024 "A cartoon snowman with a carrot nose and a red scarf, $PROP"
}
lane1 & lane2 & lane3 & wait
echo "ALLDONE" >> $LOG
