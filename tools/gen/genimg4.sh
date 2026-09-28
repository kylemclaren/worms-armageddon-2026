#!/bin/zsh
# v3 backgrounds: separate parallax planes per level, each generated at full resolution.
IU="/usr/bin/python3 /home/sprite/tools/image-use/image-use"
OUT=/home/sprite/worms/assets/raw3
LOG=/home/sprite/worms/genimg4.log
gen() {
  local f="$OUT/$1.png"
  [[ -s "$f" ]] && { echo "skip $1" >> $LOG; return; }
  echo "START $1" >> $LOG
  timeout 480 ${=IU} "$3" -o "$f" --size "$2" --quiet >> $LOG 2>&1 && echo "DONE $1" >> $LOG || echo "FAIL $1" >> $LOG
}
ART="breathtaking modern AAA 2D game background art, richly detailed digital painting like Ori and the Will of the Wisps and Rayman Legends, volumetric light, atmospheric depth, crisp detail, no characters, no text, no UI"
SKY="$ART, SKY ONLY, absolutely no land, no mountains, no ground, no horizon objects"
MAG="the entire background behind the subject is one perfectly flat solid pure magenta color (#FF00FF) with no gradient, no shadow and no texture, the subject spans the full width edge to edge and touches the bottom edge, empty magenta above it"
GRN="the entire background behind the subject is one perfectly flat solid pure green color (#00FF00) with no gradient, no shadow and no texture, the subject spans the full width edge to edge and touches the bottom edge, empty green above it"
lane1() {
  gen bg_grass_sky 1536x1024 "$SKY, a glorious golden-hour sky: towering sunlit cumulus clouds with glowing warm rim light, soft god rays, deep violet at the top blending to luminous peach and gold near the bottom, a low radiant sun near the bottom centre"
  gen bg_grass_far 1536x1024 "$ART, a wide panoramic strip of distant misty mountain ranges in soft blue-violet with warm sunset light on the peaks and layered aerial haze, occupying the lower half of the image, $MAG"
  gen bg_grass_mid 1536x1024 "$ART, a wide panoramic strip of lush rolling hills with round leafy trees, a small stone windmill and a winding path, backlit by a warm sunset with glowing rim light, occupying the lower 40 percent of the image, $MAG"
}
lane2() {
  gen bg_mars_sky 1536x1024 "$SKY, an awe-inspiring alien sky: a huge ringed gas giant planet and a small cratered moon, swirling violet and teal nebula, dense bright stars, luminous cyan aurora ribbons"
  gen bg_mars_far 1536x1024 "$ART, a wide panoramic strip of distant towering alien crystal spires and flat mesas in hazy violet-blue silhouette with soft glowing highlights, occupying the lower half of the image, $GRN"
  gen bg_mars_mid 1536x1024 "$ART, a wide panoramic strip of red rock alien mesas and natural stone arches with glowing cyan and magenta crystal clusters and strange purple bulbous plants, occupying the lower 40 percent of the image, $GRN"
}
lane3() {
  gen bg_snow_sky 1536x1024 "$SKY, a magical arctic night sky: vivid emerald and rose aurora borealis curtains, a dense field of stars and the milky way, a bright full moon, soft moonlit wisps of cloud"
  gen bg_snow_far 1536x1024 "$ART, a wide panoramic strip of distant jagged snowy mountain ranges in pale icy blue, moonlit, with drifting mist between the ranges, occupying the lower half of the image, $MAG"
  gen bg_snow_mid 1536x1024 "$ART, a wide panoramic strip of snow-laden pine forest and blue ice cliffs with a frozen waterfall, cool moonlight and soft glow, occupying the lower 40 percent of the image, $MAG"
}
lane1 & lane2 & lane3 & wait
echo "ALLDONE" >> $LOG
