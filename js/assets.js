// ===== image loading =====
// Art is generated with image-use, then keyed/trimmed/resized offline by
// tools/prep_images.py into assets/gfx, so the browser just loads it.

const BASE = 'assets/gfx/';
export const V = typeof window !== 'undefined' && window.ASSET_V ? `?v=${window.ASSET_V}` : '';

export const images = {};

const SPRITES = ['logo', 'parachute', 'tombstone', 'oildrum', 'crate_weapon', 'crate_health', 'crate_utility',
  'prop_tree', 'prop_rock', 'prop_crystal', 'prop_snowman'];
const ICONS = ['bazooka', 'homing', 'grenade', 'cluster', 'banana', 'hhg', 'shotgun', 'minigun', 'firepunch', 'bat',
  'dynamite', 'mine', 'sheep', 'airstrike', 'armageddon', 'donkey', 'rope', 'jetpack', 'teleport', 'girder',
  'blowtorch', 'skipgo', 'surrender'];

const MANIFEST = [
  ['worm', 'worm_base.png'],
  ...SPRITES.map(n => [n, n + '.png']),
  ...ICONS.map(n => [`icon_${n}`, `icon_${n}.png`]),
  ...['tex_grass', 'tex_mars', 'tex_snow'].map(n => [n, n + '.jpg']),
  ...['grass', 'mars', 'snow'].flatMap(t => ['sky', 'far', 'mid'].map(l => [`bg_${t}_${l}`, `bg_${t}_${l}.webp`])),
];

function loadImage(src) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

import { loadWormAtlas } from './wormsprite.js';

export async function loadAssets(onProgress) {
  let done = 0;
  const atlasP = loadWormAtlas(BASE, V);
  await Promise.all(MANIFEST.map(async ([name, file]) => {
    const im = await loadImage(BASE + file + V);
    if (im) images[name] = im;
    else console.warn('missing image', file);
    onProgress?.(++done / MANIFEST.length, name);
  }));
  await atlasP;
  return images;
}
