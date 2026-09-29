import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapLayers = new Map([
  ['round-01-grid.json', new Set([
    'layer-2', 'layer-3', 'layer-4', 'layer-5', 'urban-street-details', 'round76-jiangnan-orchard',
  ])],
  ['round-10-mist-ferry.json', new Set([
    'mist-river-woods', 'mist-willow-market-1', 'mist-willow-market-2', 'mist-willow-market-3',
    'mist-willow-market-4', 'mist-willow-market-5', 'round76-mist-river-market',
  ])],
  ['round-62-iron-ridge.json', new Set([
    'iron-ridge-rock-faces', 'iron-ridge-pines', 'iron-ridge-post-town-1', 'iron-ridge-post-town-2',
    'iron-ridge-post-town-3', 'iron-ridge-post-town-4', 'iron-ridge-post-town-5', 'iron-ridge-post-town-6',
    'round76-iron-ridge-pass',
  ])],
  ['round-67-salt-road.json', new Set([
    'salt-road-rises', 'salt-road-caravan-post-1', 'salt-road-caravan-post-2', 'salt-road-caravan-post-3',
    'salt-road-caravan-post-4', 'salt-road-caravan-post-5', 'salt-road-caravan-post-6',
    'round76-salt-well-and-post',
  ])],
  ['round-74-cloud-ridge.json', new Set([
    'cloud-ridge-scree', 'cloud-ridge-pines', 'cloud-ridge-waystation-1', 'cloud-ridge-waystation-2',
    'cloud-ridge-waystation-3', 'cloud-ridge-waystation-4', 'cloud-ridge-waystation-5',
    'cloud-ridge-waystation-6', 'round76-cloud-bridge-rails',
  ])],
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function writeJson(relativePath, data) {
  writeFileSync(path.join(root, relativePath), `${JSON.stringify(data, null, 2)}\n`);
}

for (const [file, depthLayerIds] of mapLayers) {
  const relativePath = `data/base/maps/${file}`;
  const map = readJson(relativePath);
  const found = new Set();
  for (const layer of map.art.layers) {
    if (depthLayerIds.has(layer.id)) {
      layer.depthSort = 'y';
      found.add(layer.id);
    } else {
      delete layer.depthSort;
    }
  }
  const missing = [...depthLayerIds].filter((id) => !found.has(id));
  if (missing.length > 0) throw new Error(`${relativePath}: missing depth layers: ${missing.join(', ')}`);
  writeJson(relativePath, map);
}

const directionalRows = { down: 0, right: 2, up: 4, left: 6 };
for (const file of ['round-03-npcs.json', 'round-74-cloud-ridge-npcs.json']) {
  const relativePath = `data/base/characters/${file}`;
  const set = readJson(relativePath);
  for (const npc of set.npcs) {
    if (!Number.isInteger(npc.spriteFrame) || npc.spriteFrame < 0 || npc.spriteFrame >= 320) {
      throw new Error(`${relativePath}: ${npc.id} has no valid R77 character frame`);
    }
    const outfitStart = Math.floor(npc.spriteFrame / 32) * 32;
    npc.spriteFrames = Object.fromEntries(Object.entries(directionalRows).map(([direction, row]) => [
      direction,
      outfitStart + row * 4,
    ]));
  }
  writeJson(relativePath, set);
}

console.info('Assigned y-depth rows to five world maps and four cardinal poses to the NPC data sets.');
