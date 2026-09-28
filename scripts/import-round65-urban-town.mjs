import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Round 65 — modest urban path & plaza patch for the starting map.
 *
 * Reads the existing 100×100 starting map and appends two data-only art
 * layers drawn from the CC0 Kenney RPG Urban Pack atlas (27×18 grid, 16px
 * tiles, 0 spacing). Collision (`grid`), spawn, NPCs, quests, shops and
 * routes are never touched.
 *
 * Honest-layout rules (fixed after the first paint landed on the cemetery):
 * the district around the spawn is a graveyard — solid cells carry existing
 * gravestone/wall/fence art in Tiled layers 2–5, and many walkable cells
 * carry the map's original dirt paths. Street ground is therefore painted
 * ONLY on genuinely open cells: walkable AND completely blank in layers
 * 2–5, so tombstones, graveyard floors and existing paths are never
 * repainted. The second layer adds a few manhole details on top of the new
 * road tiles; it does not pretend blocked grave markers are shopfronts.
 *
 * The same run also switches the actor atlas of all three 100×100 maps to
 * the urban pack and rewrites NPC sprite frames (character data, not the
 * engine, decides every frame). Actor frames are confined to the atlas
 * character columns (frame % 27 >= 23); town layers never use those cells.
 * Re-running the script is idempotent: the urban tileset/layer entries are
 * replaced, not duplicated.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mapPaths = {
  start: resolve(repoRoot, 'data/base/maps/round-01-grid.json'),
  ferry: resolve(repoRoot, 'data/base/maps/round-10-mist-ferry.json'),
  ridge: resolve(repoRoot, 'data/base/maps/round-62-iron-ridge.json'),
};
const npcPath = resolve(repoRoot, 'data/base/characters/round-03-npcs.json');

const URBAN_TILESET = {
  id: 'kenney.rpg-urban-pack',
  image: 'assets/kenney/rpg-urban-pack/tilemap_packed.png',
  tileSize: 16,
  columns: 27,
  rows: 18,
  spacing: 0,
  tileCount: 486,
};

// Actor frames (0-based), all visually verified against a cell-indexed
// contact sheet of the packed atlas. Characters live exclusively in atlas
// columns 23–26 (frame % 27 >= 23) as four-cell groups; each group is one
// base outfit shown in four static facing/pose variants — not 14 unique
// designs. Verified groups: 23–26 (dark casual wear), 131–134 (light robe),
// 239–242 (red top), 347–350 (olive work overalls), 455–458 (blue uniform).
// Frames 327–335/354–358 previously used here are doors/walls, never people.
const PLAYER_FRAME = 24; // dark casual outfit, front-facing stance
const DEFAULT_NPC_FRAME = 131; // light-robe group, distinct from the player
const NPC_FRAMES = {
  'char.shen-mohan': 132, // light-robe group
  'char.lu-zhenniang': 240, // red-top group
  'char.liu-tinglan': 349, // work-overalls group
  'char.gu-yechen': 348, // work-overalls group
  'char.rong-su-qing': 133, // light-robe group
  'char.wen-suxin': 241, // red-top group
  'char.shi-bei': 347, // work-overalls group
  'char.ma-shangyi': 26, // dark casual group (different cell from the player)
  'char.ye-tingzhou': 134, // light-robe group
  'char.zhu-jiuxian': 457, // blue-uniform group
  'char.bai-luzhou': 25, // dark casual group
  'char.shao-changgeng': 23, // dark casual group
  'char.qin-suyan': 350, // work-overalls group
  'char.jiang-baiwei': 456, // blue-uniform group
};

// Ground tile palette (0-based atlas frames; layer GIDs are frame + 1).
// Every frame below was visually confirmed on the contact sheet as road,
// pavement or utility surface; none sits in the character columns 23–26.
const pick = (frames, seed) => frames[seed % frames.length];
const ROAD_PLAIN = [439, 440, 441]; // plain asphalt
const ROAD_MARKED = [432, 433]; // marked / concrete roadway
const PAVEMENT = [434, 435, 436]; // concrete walkway tiles
const UTILITY = [442, 443, 444, 445]; // manhole / utility covers
const PLAZA = [432, 433, 434, 435, 436];

/** Deterministic per-cell hash so patterns are stable across runs. */
const cellHash = (col, row) => (col * 37 + row * 23 + col * row * 11) >>> 0;

function buildUrbanLayers(grid, decoLayers) {
  const rows = grid.length;
  const columns = grid[0].length;
  const ground = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
  const details = Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));

  // Genuinely open cell: walkable AND carrying no art in the original Tiled
  // decoration layers. Tombstones, graveyard floors and the map's original
  // dirt paths all live in layers 2–5, so they are never repainted.
  const open = (col, row) =>
    col >= 0 && row >= 0 && col < columns && row < rows &&
    grid[row][col] !== '#' && decoLayers.every((cells) => cells[row][col] === 0);

  const paint = (rowRange, colRange, palette) => {
    for (let row = rowRange[0]; row <= rowRange[1]; row++) {
      for (let col = colRange[0]; col <= colRange[1]; col++) {
        if (open(col, row)) ground[row][col] = pick(palette, cellHash(col, row)) + 1;
      }
    }
  };

  // 1) Spawn square: a small paved yard on the open lawn west of the spawn,
  //    which itself sits on an original dirt path that stays untouched.
  paint([36, 38], [39, 41], PAVEMENT);

  // 2) Main street: a short east–west carriage way across row 40 with
  //    occasional markings and utility covers, on the open stretch only.
  for (let col = 47; col <= 58; col++) {
    if (!open(col, 40)) continue;
    const hash = cellHash(col, 40);
    let frame;
    if (hash % 9 === 0) frame = pick(UTILITY, hash);
    else if (hash % 5 === 0) frame = pick(ROAD_MARKED, hash);
    else frame = pick(ROAD_PLAIN, cellHash(col, 3));
    ground[40][col] = frame + 1;
  }

  // 3) Market lane: a narrow paved lane linking the street to the plaza.
  paint([41, 43], [51, 51], PAVEMENT);

  // 4) Market plaza floor on the open square in the south-east.
  paint([41, 43], [52, 61], PLAZA);

  // 5) Utility covers sit on selected road cells as a distinct detail layer.
  // Both the underlay and detail are flat surfaces on walkable cells.
  for (let col = 47; col <= 58; col++) {
    const hash = cellHash(col, 40);
    if (ground[40][col] !== 0 && hash % 4 === 0) {
      details[40][col] = pick(UTILITY, hash) + 1;
    }
  }

  let painted = 0;
  let detailed = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (ground[row][col] !== 0) painted++;
      if (details[row][col] !== 0) detailed++;
    }
  }
  return { ground, details, painted, detailed };
}

const startMap = JSON.parse(await readFile(mapPaths.start, 'utf8'));
const grid = startMap.grid;
if (grid.length !== 100 || grid[0].length !== 100) {
  throw new Error(`Expected the 100×100 starting map, got ${grid[0].length}×${grid.length}.`);
}

const urbanTilesetIndex = startMap.art.tilesets.findIndex((tileset) => tileset.id === URBAN_TILESET.id);
if (urbanTilesetIndex === -1) startMap.art.tilesets.push(URBAN_TILESET);
else startMap.art.tilesets[urbanTilesetIndex] = URBAN_TILESET;

const decoLayers = ['layer-2', 'layer-3', 'layer-4', 'layer-5']
  .map((id) => startMap.art.layers.find((layer) => layer.id === id)?.cells)
  .filter((cells) => cells !== undefined);
if (decoLayers.length !== 4) {
  throw new Error(`Expected Tiled decoration layers 2–5 on the starting map, found ${decoLayers.length}.`);
}

const { ground, details, painted, detailed } = buildUrbanLayers(grid, decoLayers);
const groundLayer = { id: 'urban-street-ground', tilesetId: 'kenney.rpg-urban-pack', cells: ground };
const detailsLayer = { id: 'urban-street-details', tilesetId: 'kenney.rpg-urban-pack', cells: details };
const layerIds = new Set(['urban-street-ground', 'urban-street-details', 'urban-town-facades']);
startMap.art.layers = startMap.art.layers.filter((layer) => !layerIds.has(layer.id)).concat([groundLayer, detailsLayer]);
startMap.art.actors = {
  tilesetId: 'kenney.rpg-urban-pack',
  playerFrame: PLAYER_FRAME,
  defaultNpcFrame: DEFAULT_NPC_FRAME,
};

for (const key of ['ferry', 'ridge']) {
  const map = JSON.parse(await readFile(mapPaths[key], 'utf8'));
  const index = map.art.tilesets.findIndex((tileset) => tileset.id === URBAN_TILESET.id);
  if (index === -1) map.art.tilesets.push(URBAN_TILESET);
  else map.art.tilesets[index] = URBAN_TILESET;
  map.art.actors = {
    tilesetId: 'kenney.rpg-urban-pack',
    playerFrame: PLAYER_FRAME,
    defaultNpcFrame: DEFAULT_NPC_FRAME,
  };
  await writeFile(mapPaths[key], `${JSON.stringify(map, null, 2)}\n`);
  console.log(`${key}: actor atlas switched to ${URBAN_TILESET.id} (player ${PLAYER_FRAME}).`);
}

const npcDoc = JSON.parse(await readFile(npcPath, 'utf8'));
for (const npc of npcDoc.npcs) {
  const frame = NPC_FRAMES[npc.id];
  if (frame === undefined) throw new Error(`No Round 65 urban frame decided for ${npc.id}.`);
  npc.spriteFrame = frame;
}
await writeFile(npcPath, `${JSON.stringify(npcDoc, null, 2)}\n`);

await writeFile(mapPaths.start, `${JSON.stringify(startMap, null, 2)}\n`);
console.log(`start: modest street/plaza ground painted on ${painted} open cells, with ${detailed} road details.`);
console.log(`npc frames rewritten: ${npcDoc.npcs.length} characters on the urban actor atlas.`);
