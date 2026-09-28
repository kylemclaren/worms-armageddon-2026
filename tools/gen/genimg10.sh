#!/bin/zsh
# Desert level: parallax planes, texture and props.
IU=(/usr/bin/python3 /home/sprite/tools/image-use/image-use)
OUT=/home/sprite/worms/assets/raw9
LOG=/home/sprite/worms/genimg10.log
ART="breathtaking modern AAA 2D game background art, richly detailed digital painting like Ori and the Will of the Wisps and Rayman Legends, volumetric light, atmospheric depth, crisp detail, no characters, no text, no UI"
MAG="the entire background behind the subject is one perfectly flat solid pure magenta color (#FF00FF) with no gradient, no shadow and no texture, the subject spans the full width edge to edge and touches the bottom edge, empty magenta above it"
STYLE="cute polished modern 2D cartoon game sprite matching Worms Armageddon style: crisp clean dark outline, soft cel shading with a warm rim light, vibrant colours, single object centred with generous margin, transparent background, no ground, no shadow, no text"
TEX="polished modern HD 2D game art, seamless tileable square texture viewed straight on, evenly lit, no horizon, no sky, no perspective, uniform density edge to edge"
gen() { local f="$OUT/$1.png"; [[ -s "$f" ]] && return; echo "START $1" >> $LOG
  timeout 480 $IU "$2" -o "$f" --size "$3" "${@:4}" --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG; }
lane1() {
  gen bg_desert_sky "$ART, SKY ONLY, absolutely no land, no dunes, no horizon objects, a blazing desert sky at golden hour: warm amber and coral gradient, thin high cirrus streaks catching the light, a huge soft low sun glowing near the bottom centre, heat shimmer" 1536x1024
  gen bg_desert_far "$ART, a wide panoramic strip of distant towering sandstone mesas and buttes in hazy peach and lilac silhouette with soft sunset rim light, occupying the lower half of the image, $MAG" 1536x1024
  gen bg_desert_mid "$ART, a wide panoramic strip of rolling golden sand dunes with sharp wind-sculpted crests, a small palm oasis with a turquoise pool and an ancient crumbling sandstone arch, warm late-afternoon light, occupying the lower 40 percent of the image, $MAG" 1536x1024
}
lane2() {
  gen tex_desert "$TEX, cross-section of layered sandstone and packed desert sand strata in warm ochre, peach and rust bands with small embedded pebbles and fossil shells" 1024x1024
  gen prop_cactus "A cheerful tall saguaro cactus with two arms and a small pink flower, $STYLE" 1024x1024 --background transparent --format png
  gen prop_palm "A leaning desert palm tree with a curved trunk and lush green fronds and a coconut cluster, $STYLE" 1024x1024 --background transparent --format png
}
lane3() {
  gen prop_bones "A sun-bleached cartoon cow skull resting on a small pile of sandstone rocks, $STYLE" 1024x1024 --background transparent --format png
  gen prop_obelisk "A small crumbling ancient sandstone obelisk with faded hieroglyph carvings, $STYLE" 1024x1024 --background transparent --format png
  gen crab "A cute little orange crab facing the viewer with raised claws, $STYLE" 1024x1024 --background transparent --format png
}
lane1 & lane2 & lane3 & wait
echo ALLDONE >> $LOG
