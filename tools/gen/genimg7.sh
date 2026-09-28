#!/bin/zsh
# v3 sprites: native transparency, cute style matched to the worms.
IU=(/usr/bin/python3 /home/sprite/tools/image-use/image-use)
OUT=/home/sprite/worms/assets/raw6
LOG=/home/sprite/worms/genimg7.log
STYLE="cute polished modern 2D cartoon game sprite in the style of Worms Armageddon and Worms W.M.D: chunky friendly proportions, crisp clean dark-brown outline, soft cel shading with a warm rim light, vibrant cheerful colours, high detail, single object centred with generous margin, transparent background, no ground, no shadow, no text"
gen() { local f="$OUT/$1.png"; [[ -s "$f" ]] && return; echo "START $1" >> $LOG
  timeout 480 $IU "$2, $STYLE" -o "$f" --size 1024x1024 --background transparent --format png --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG; }
lane1() {
  gen prop_snowman "A jolly chubby snowman with coal eyes, a carrot nose, a tiny black top hat and a red knitted scarf, stick arms waving"
  gen prop_tree "A cartoon tree with a short twisted trunk and a big fluffy rounded green canopy"
  gen prop_rock "A small pile of rounded mossy grey boulders"
  gen prop_crystal "A cluster of glowing magenta and cyan crystals growing from a rock"
  gen crate_weapon "A sturdy wooden weapons crate with metal corners and a red target emblem on the front"
  gen crate_health "A white first-aid crate with a big red cross on the front and metal clasps"
  gen crate_utility "A blue metal utility crate with a yellow wrench emblem and hazard stripes"
  gen oildrum "A red explosive oil drum with a yellow flame hazard symbol"
}
lane2() {
  gen tombstone "A small rounded grey gravestone with RIP carved on it and a tuft of grass at the base"
  gen icon_mine "A round black land mine with short spikes and a small blinking red light"
  gen icon_bazooka "An olive-green bazooka rocket launcher pointing right"
  gen icon_homing "A red and white homing missile with a glowing blue nose pointing right"
  gen icon_grenade "A dark green hand grenade with a silver pin ring"
  gen icon_cluster "A red cluster bomb with small bomblets spilling out"
  gen icon_banana "A shiny yellow banana with a lit fuse sticking out of the top"
  gen icon_hhg "An ornate golden holy hand grenade orb with a jewelled cross on top"
}
lane3() {
  gen icon_shotgun "A pump-action shotgun with a wooden stock pointing right"
  gen icon_minigun "A chunky six-barrel minigun pointing right"
  gen icon_firepunch "A flaming fist punching upward"
  gen icon_bat "A wooden baseball bat with motion swooshes"
  gen icon_dynamite "A bundle of red dynamite sticks tied with twine and a lit sparking fuse"
  gen icon_sheep "A fluffy white cartoon sheep facing right with a stick of dynamite strapped to its back"
  gen icon_airstrike "A small propeller bomber plane flying right dropping three bombs"
  gen icon_armageddon "Flaming meteors raining down on a small cracked planet"
}
lane4() {
  gen icon_donkey "A heavy grey concrete donkey statue"
  gen icon_rope "A coiled climbing rope with a steel grappling hook"
  gen icon_jetpack "A retro silver jetpack with two thrusters firing blue flames"
  gen icon_teleport "A swirling violet teleport portal with sparkles"
  gen icon_girder "A red steel I-beam girder with rivets, diagonal"
  gen icon_blowtorch "A handheld blowtorch with a hot blue flame pointing right"
  gen icon_skipgo "A glossy round blue button with a white fast-forward double-arrow symbol"
  gen icon_surrender "A white surrender flag waving on a wooden pole"
}
lane1 & lane2 & lane3 & lane4 & wait
echo ALLDONE >> $LOG
