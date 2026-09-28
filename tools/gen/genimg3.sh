#!/bin/zsh
# v2 art pass: modern HD look. Raw output -> assets/raw2
IU="/usr/bin/python3 /home/sprite/tools/image-use/image-use"
OUT=/home/sprite/worms/assets/raw2
LOG=/home/sprite/worms/genimg3.log
gen() {
  local f="$OUT/$1.png"
  [[ -s "$f" ]] && { echo "skip $1" >> $LOG; return; }
  echo "START $1" >> $LOG
  timeout 480 ${=IU} "$3" -o "$f" --size "$2" --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG
}
STYLE="polished modern HD 2D game art in the style of Worms W.M.D (2016) and Worms Rumble: richly hand-painted, soft studio lighting with a gentle warm rim light, smooth gradients, subtle ambient occlusion, clean thin dark-brown outline, glossy believable materials, vibrant but natural palette, crisp detail"
ICON="$STYLE, single game item icon centered, three-quarter view, isolated on a plain pure white background, generous margin, no text, no ground, no cast shadow on the background"
SPR="$STYLE, single game sprite isolated on a plain pure white background, generous margin, no text, no ground, no cast shadow on the background"
SKY="$STYLE, wide cinematic parallax game background, soft atmospheric perspective and depth haze, painterly, no characters, no text, no foreground ground plane, the bottom third fades into soft haze"
TEX="$STYLE, seamless tileable square texture viewed straight on, evenly lit, no horizon, no sky, no perspective, uniform density edge to edge"
lane1() {
  gen worm_base 1024x1024 "A cute cartoon pink earthworm soldier character standing upright facing right, wearing a small olive army helmet, big expressive eyes, cheeky grin, segmented glossy body, $SPR"
  gen sky_sunset 3840x2160 "Warm golden-hour sky over a distant misty valley, layered soft orange and violet clouds, far blue mountain silhouettes on the horizon, $SKY"
  gen sky_alien 3840x2160 "Alien planet sky, deep teal and violet nebula, two moons, glowing aurora ribbons, far jagged crystal spires on the horizon, $SKY"
  gen sky_arctic 3840x2160 "Crisp arctic twilight sky with green aurora borealis, far snowy mountain range on the horizon, pale blue haze, $SKY"
  gen tex_grass 1024x1024 "Cross-section of rich brown earth with small embedded pebbles, tiny roots and darker clay veins, $TEX"
  gen tex_mars 1024x1024 "Cross-section of rust-red martian rock strata with dark basalt pebbles and faint glowing mineral flecks, $TEX"
  gen tex_snow 1024x1024 "Cross-section of compacted glacier ice and snow layers, pale cyan with frosted cracks and trapped bubbles, $TEX"
  gen crate_weapon 1024x1024 "A sturdy wooden military supply crate with metal corner brackets and a red target emblem stencilled on the front, $SPR"
  gen crate_health 1024x1024 "A white medical supply crate with a bold red cross and metal clasps, $SPR"
  gen crate_utility 1024x1024 "A blue-grey metal utility crate with a yellow wrench emblem and hazard stripes, $SPR"
}
lane2() {
  gen icon_bazooka 1024x1024 "An olive green bazooka rocket launcher pointing right, $ICON"
  gen icon_homing 1024x1024 "A sleek red and white homing missile with a glowing blue seeker nose pointing right, $ICON"
  gen icon_grenade 1024x1024 "A dark green frag hand grenade with a steel pin ring, $ICON"
  gen icon_cluster 1024x1024 "A red cluster bomb shell with small bomblets bursting from it, $ICON"
  gen icon_banana 1024x1024 "A shiny yellow banana with a lit fuse sticking out of its top, comedic bomb, $ICON"
  gen icon_hhg 1024x1024 "The ornate golden holy hand grenade orb with a jewelled cross on top and a soft holy glow, $ICON"
  gen icon_shotgun 1024x1024 "A pump-action shotgun with a wooden stock pointing right, $ICON"
  gen icon_minigun 1024x1024 "A heavy six-barrel rotary minigun pointing right, $ICON"
  gen icon_firepunch 1024x1024 "A flaming fist punching upward with fiery trails, $ICON"
  gen icon_bat 1024x1024 "A wooden baseball bat mid-swing with motion streaks, $ICON"
}
lane3() {
  gen icon_dynamite 1024x1024 "A bundle of three red dynamite sticks tied with twine with a lit sparking fuse, $ICON"
  gen icon_mine 1024x1024 "A round dark steel land mine with short spikes and a small red indicator light, $ICON"
  gen icon_sheep 1024x1024 "A fluffy white cartoon sheep facing right with a stick of dynamite strapped to its back, $ICON"
  gen icon_airstrike 1024x1024 "A small propeller bomber plane flying right dropping three bombs, side view, $ICON"
  gen icon_armageddon 1024x1024 "Flaming meteors streaking down toward a small cracked planet, apocalyptic, $ICON"
  gen icon_donkey 1024x1024 "A heavy grey concrete donkey statue, $ICON"
  gen icon_rope 1024x1024 "A coiled climbing rope with a steel grappling hook, $ICON"
  gen icon_jetpack 1024x1024 "A retro silver jetpack with twin thrusters firing blue flames, $ICON"
  gen icon_teleport 1024x1024 "A swirling violet teleport portal with sparkles, $ICON"
  gen icon_girder 1024x1024 "A rusty red steel I-beam girder with rivets, diagonal, $ICON"
}
lane4() {
  gen icon_blowtorch 1024x1024 "A handheld blowtorch with a hot blue flame pointing right, $ICON"
  gen icon_skipgo 1024x1024 "A glossy blue round button with a white fast-forward double arrow symbol, $ICON"
  gen icon_surrender 1024x1024 "A white surrender flag on a wooden pole waving, $ICON"
  gen tombstone 1024x1024 "A small weathered grey gravestone with RIP engraved, a little moss at the base, $SPR"
  gen oildrum 1024x1024 "A red explosive oil drum barrel with a yellow flammable hazard symbol, $SPR"
  gen prop_tree 1024x1024 "A stylised gnarled tree with a twisted trunk and a lush rounded green canopy, side view, $SPR"
  gen prop_rock 1024x1024 "A cluster of mossy grey boulders, side view, $SPR"
  gen prop_crystal 1024x1024 "A cluster of glowing magenta and cyan alien crystals, side view, $SPR"
  gen prop_snowman 1024x1024 "A cheerful snowman with a carrot nose, top hat and red scarf, side view, $SPR"
  gen logo 1536x1024 "The title text WORMS ARMAGEDDON as a bold chunky 3D game logo, glossy orange-to-yellow metallic letters with dark outline, a small explosion behind and a cartoon pink worm in an army helmet peeking over the letters, $SPR"
}
lane1 & lane2 & lane3 & lane4 & wait
echo "ALLDONE" >> $LOG
