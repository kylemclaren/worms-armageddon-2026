#!/bin/zsh
IU="/usr/bin/python3 /tmp/claude-1001/-home-sprite/abf8ab40-3374-45e5-9140-c2b321372bd7/scratchpad/image-use/image-use"
OUT=/home/sprite/worms/assets/img
LOG=/home/sprite/worms/genimg.log
gen() { # name, size, prompt
  local f="$OUT/$1.png"
  [[ -s "$f" ]] && { echo "skip $1" >> $LOG; return; }
  echo "START $1" >> $LOG
  timeout 420 ${=IU} "$3" -o "$f" --size "$2" --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG
}
ICON="game UI icon, single object centered, thick black outline, flat cel-shaded cartoon style like a 1999 Team17 Worms game, vivid saturated colors, plain solid white background, generous margin, no text, no shadow on background"

lane1() {
  gen icon_bazooka 1024x1024 "A green military bazooka rocket launcher tube pointing up-right, $ICON"
  gen icon_grenade 1024x1024 "A round dark-green hand grenade with a red pin and a lit orange fuse spark, $ICON"
  gen icon_cluster 1024x1024 "A fat red cluster bomb splitting into four small bomblets, $ICON"
  gen icon_shotgun 1024x1024 "A double-barrel shotgun with wooden stock pointing right, $ICON"
  gen icon_hhg 1024x1024 "A shiny golden holy hand grenade with a large christian cross on top and a red fuse, glowing halo, $ICON"
  gen icon_dynamite 1024x1024 "A bundle of red dynamite sticks tied with rope, lit sparking fuse, $ICON"
  gen icon_banana 1024x1024 "A yellow banana shaped bomb with a lit fuse and tiny fins, $ICON"
  gen icon_airstrike 1024x1024 "A small cartoon biplane airplane dropping three bombs, side view flying right, $ICON"
  gen icon_mine 1024x1024 "A round black naval sea mine with spikes and a blinking red light, $ICON"
}
lane2() {
  gen icon_teleport 1024x1024 "A swirling purple teleporter portal vortex with sparkles, $ICON"
  gen icon_girder 1024x1024 "A brown steel girder construction beam with rivets, diagonal, $ICON"
  gen icon_minigun 1024x1024 "A black six-barrel rotary minigun gatling gun pointing right, $ICON"
  gen icon_firepunch 1024x1024 "A cartoon worm fist punching upward with orange flames trailing, $ICON"
  gen icon_jetpack 1024x1024 "A silver jetpack backpack with two rocket nozzles firing blue flame, $ICON"
  gen icon_skipgo 1024x1024 "A white skip-forward double triangle arrow symbol inside a blue circle, $ICON"
  gen crate_weapon 1024x1024 "A wooden supply crate with a yellow parachute rope handle and a red weapon crosshair emblem painted on the front, $ICON"
  gen crate_health 1024x1024 "A white medical first aid box with a bold red cross on the front, $ICON"
  gen crate_utility 1024x1024 "A metal toolbox crate with a blue wrench and spanner emblem on the front, $ICON"
}
lane3() {
  gen tombstone 1024x1024 "A grey stone grave headstone with RIP carved on it, small and chunky, $ICON"
  gen oildrum 1024x1024 "A red explosive oil barrel drum with a yellow flame hazard symbol, $ICON"
  gen sky_sunset 1536x1024 "A wide cartoon game background of a warm orange and purple sunset sky over distant rolling green hills and soft clouds, no foreground objects, flat cel-shaded 1999 Team17 Worms game art style, empty bottom half"
  gen sky_alien 1536x1024 "A wide cartoon game background of an alien planet sky, deep purple and teal with two moons and green nebula clouds, distant jagged crystal mountains on the horizon, flat cel-shaded cartoon game art style, empty bottom half"
  gen sky_arctic 1536x1024 "A wide cartoon game background of a pale blue arctic sky with aurora northern lights and distant snowy mountain peaks, flat cel-shaded cartoon game art style, empty bottom half"
  gen tex_grass 1024x1024 "A seamless tileable texture of brown dirt soil with small pebbles and rocks, top-down flat cartoon game texture, flat cel-shaded 1999 Team17 Worms style, uniform, no horizon, no sky"
  gen tex_mars 1024x1024 "A seamless tileable texture of red-orange martian rock and dust with dark cracks, flat cartoon game texture, uniform, no horizon, no sky"
  gen tex_snow 1024x1024 "A seamless tileable texture of packed pale blue ice and snow with frost cracks, flat cartoon game texture, uniform, no horizon, no sky"
  gen logo 1536x1024 "The words WORMS ARMAGEDDON as a chunky 3D extruded cartoon game logo, bold yellow-orange metallic letters with thick black outline and red drop shadow, small explosion and a cartoon worm peeking over the top of the letters, plain solid white background, 1999 video game title art style"
}
lane1 & lane2 & lane3 & wait
echo "ALLDONE" >> $LOG
