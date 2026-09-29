import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(projectRoot, 'scripts', 'sources', 'opengameart', 'puny-characters');
const assetDirectory = path.join(projectRoot, 'data', 'assets', 'opengameart', 'puny-characters');
const atlasPath = path.join(assetDirectory, 'actors.png');
const directions = { down: 0, right: 2, up: 4, left: 6 };
const appearances = [
  'Archer-Green',
  'Archer-Purple',
  'Character-Base',
  'Mage-Cyan',
  'Mage-Red',
  'Soldier-Blue',
  'Soldier-Red',
  'Soldier-Yellow',
  'Warrior-Blue',
  'Warrior-Red',
];
const sourceColumns = [0, 3, 4, 5]; // idle first frame, then all three walk frames
const frameSize = 16;
const framesPerAppearance = 8 * 4;
const atlasColumns = 20;
const atlasRows = appearances.length * framesPerAppearance / atlasColumns;

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return chunk;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const cornerDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= cornerDistance) return left;
  return aboveDistance <= cornerDistance ? above : upperLeft;
}

function decodeRgbaPng(bytes, label) {
  if (!bytes.subarray(0, 8).equals(pngSignature)) throw new Error(label + ': not a PNG file');
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressed = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(label + ': expected non-interlaced 8-bit RGBA PNG');
  }
  const packed = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = Buffer.allocUnsafe(stride * height);
  let packedOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = packed[packedOffset++];
    const row = Buffer.from(packed.subarray(packedOffset, packedOffset + stride));
    packedOffset += stride;
    if (filter > 4) throw new Error(label + ': unsupported PNG filter ' + filter);
    for (let index = 0; index < stride; index++) {
      const left = index >= 4 ? row[index - 4] : 0;
      const above = previous[index];
      const upperLeft = index >= 4 ? previous[index - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      row[index] = (row[index] + predictor) & 0xff;
    }
    row.copy(pixels, y * stride);
    previous = row;
  }
  return { width, height, pixels };
}

function encodeRgbaPng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const stride = width * 4;
  const filtered = Buffer.allocUnsafe(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const destination = y * (stride + 1);
    filtered[destination] = 0;
    pixels.copy(filtered, destination + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(filtered, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const atlasWidth = atlasColumns * frameSize;
const atlasHeight = atlasRows * frameSize;
const atlasPixels = Buffer.alloc(atlasWidth * atlasHeight * 4);
for (let appearanceIndex = 0; appearanceIndex < appearances.length; appearanceIndex++) {
  const name = appearances[appearanceIndex];
  const sourcePath = path.join(sourceDirectory, name + '.png');
  const source = decodeRgbaPng(readFileSync(sourcePath), sourcePath);
  if (source.width !== 768 || source.height !== 256) {
    throw new Error(name + ': expected an 8-direction 24×8 sheet of 32px cells, got ' + source.width + '×' + source.height);
  }
  for (let directionRow = 0; directionRow < 8; directionRow++) {
    for (let pose = 0; pose < sourceColumns.length; pose++) {
      const frameIndex = appearanceIndex * framesPerAppearance + directionRow * 4 + pose;
      const outputX = (frameIndex % atlasColumns) * frameSize;
      const outputY = Math.floor(frameIndex / atlasColumns) * frameSize;
      const sourceX = sourceColumns[pose] * 32 + 8;
      const sourceY = directionRow * 32 + 8;
      for (let y = 0; y < frameSize; y++) {
        const from = ((sourceY + y) * source.width + sourceX) * 4;
        const to = ((outputY + y) * atlasWidth + outputX) * 4;
        source.pixels.copy(atlasPixels, to, from, from + frameSize * 4);
      }
      let hasAlpha = false;
      for (let y = 0; y < frameSize && !hasAlpha; y++) {
        for (let x = 0; x < frameSize; x++) {
          if (atlasPixels[((outputY + y) * atlasWidth + outputX + x) * 4 + 3] !== 0) {
            hasAlpha = true;
            break;
          }
        }
      }
      if (!hasAlpha) throw new Error(name + ': empty frame ' + frameIndex);
    }
  }
}

mkdirSync(assetDirectory, { recursive: true });
writeFileSync(atlasPath, encodeRgbaPng(atlasWidth, atlasHeight, atlasPixels));

function frameFor(appearanceIndex, directionRow, pose) {
  return appearanceIndex * framesPerAppearance + directionRow * 4 + pose;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  writeFileSync(path.join(projectRoot, relativePath), JSON.stringify(value, null, 2) + '\n');
}

for (const relativePath of [
  'data/base/maps/round-01-grid.json',
  'data/base/maps/round-10-mist-ferry.json',
  'data/base/maps/round-62-iron-ridge.json',
  'data/base/maps/round-67-salt-road.json',
  'data/base/maps/round-74-cloud-ridge.json',
]) {
  const map = readJson(relativePath);
  if (map.art === undefined) throw new Error(relativePath + ': missing map art metadata');
  map.art.tilesets = map.art.tilesets.filter((tileset) => tileset.id !== 'opengameart.puny-characters');
  map.art.tilesets.push({
    id: 'opengameart.puny-characters',
    image: 'assets/opengameart/puny-characters/actors.png',
    tileSize: 16,
    columns: atlasColumns,
    rows: atlasRows,
    spacing: 0,
    tileCount: appearances.length * framesPerAppearance,
  });
  const playerAppearance = appearances.indexOf('Warrior-Blue');
  const makeFrames = (pose) => Object.fromEntries(Object.entries(directions).map(([direction, row]) => [
    direction,
    pose === 0
      ? frameFor(playerAppearance, row, 0)
      : [1, 2, 3].map((walkPose) => frameFor(playerAppearance, row, walkPose)),
  ]));
  map.art.actors = {
    tilesetId: 'opengameart.puny-characters',
    playerFrame: frameFor(playerAppearance, directions.down, 0),
    defaultNpcFrame: frameFor(2, directions.down, 0),
    playerFrames: { idle: makeFrames(0), walk: makeFrames(1) },
  };
  writeJson(relativePath, map);
}

let npcOrdinal = 0;
for (const relativePath of [
  'data/base/characters/round-03-npcs.json',
  'data/base/characters/round-74-cloud-ridge-npcs.json',
]) {
  const set = readJson(relativePath);
  for (const npc of set.npcs) {
    const appearanceIndex = (npcOrdinal * 7 + 2) % appearances.length;
    const directionRow = [0, 2, 4, 6][npcOrdinal % 4];
    npc.spriteFrame = frameFor(appearanceIndex, directionRow, 0);
    npcOrdinal++;
  }
  writeJson(relativePath, set);
}

console.info('Generated %s (%d×%d; %d frames), updated 5 maps and %d NPCs.',
  path.relative(projectRoot, atlasPath), atlasWidth, atlasHeight,
  appearances.length * framesPerAppearance, npcOrdinal);
