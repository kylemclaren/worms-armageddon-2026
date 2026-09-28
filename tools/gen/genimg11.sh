#!/bin/zsh
# Weapon icons batch 2: 20 transparent weapon/utility icons.
IU=(/usr/bin/python3 /home/sprite/tools/image-use/image-use)
OUT=/home/sprite/worms/assets/raw10
LOG=/home/sprite/worms/genimg11.log
mkdir -p $OUT
STYLE="cute polished modern 2D cartoon game sprite matching Worms Armageddon style: crisp clean dark outline, soft cel shading with a warm rim light, vibrant colours, single object centred with generous margin, transparent background, no ground, no shadow, no text"
gen() { local f="$OUT/$1.png"; [[ -s "$f" ]] && return; echo "START $1" >> $LOG
  timeout 480 $IU "$2, $STYLE" -o "$f" --size 1024x1024 --background transparent --format png --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG; }
lane1() {
  gen pigeon "A plump grey-blue cartoon homing pigeon in flight, side view facing right, wings raised mid-flap, determined expression, tiny red explosive bundle strapped to its back"
  gen mortar "A stubby olive-green shoulder mortar launcher tube with a wide muzzle, side view, horizontal, muzzle pointing right"
  gen uzi "A compact black submachine gun, side view, horizontal, barrel pointing right"
  gen handgun "A chunky cartoon silver revolver pistol, side view, horizontal, barrel pointing right"
  gen longbow "A tall wooden longbow drawn with an arrow nocked, side view, the arrow horizontal pointing right"
}
lane2() {
  gen dragonball "A glowing swirling fireball orb of orange and gold flame with a bright white-hot core and a short comet tail trailing to the left"
  gen kamikaze "A red cloth headband knotted with two long fluttering tails, with a small cartoon explosion burst behind it"
  gen prod "A cartoon white-gloved hand with the index finger extended poking to the right, side view"
  gen axe "A medieval double-headed battle axe with a wooden haft, diagonal"
  gen napalm "A stubby red napalm canister bomb with tail fins, flames licking from its nose, horizontal, nose pointing right"
}
lane3() {
  gen minestrike "Three round black spiked sea mines each with a red light falling with speed lines"
  gen sheepstrike "A fluffy white cartoon sheep falling head-first from the sky with a panicked face and speed lines"
  gen petrol "A glass bottle petrol bomb with a burning rag stuffed in the neck, side view, the bottle lying perfectly horizontal and level (not tilted, not diagonal), base on the left and neck pointing straight right, flames rising from the rag"
  gen vase "An ornate blue-and-white Chinese Ming dynasty porcelain vase, upright"
  gen drill "A yellow pneumatic jackhammer drill, upright, bit pointing down"
}
lane4() {
  gen supersheep "A fluffy white cartoon sheep wearing a flowing red superhero cape, flying horizontally facing right with front hooves stretched forward, heroic grin"
  gen oldwoman "A tiny cartoon granny in a lilac cardigan with a grey bun and a knitting bag, walking, full body side view facing right"
  gen madcow "A cartoon black-and-white dairy cow with wild crazy spiral eyes and tongue out, full body side view facing right, walking"
  gen quake "A chunk of cracked brown earth splitting apart with jagged cracks and shake lines"
  gen scales "Golden scales of justice, balanced"
}
lane1 & lane2 & lane3 & lane4 & wait
echo ALLDONE >> $LOG
