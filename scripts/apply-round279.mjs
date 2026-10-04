import { repairCloudSignArtRaw } from './lib/round279-sign-art.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  CLOUD_ADVICE_AFTER,
  FORK_SIGN_EVENT,
  FORK_SIGN_LANDMARK,
  GRAPH_EDGES,
  GRAPH_NODE,
  MANIFEST_ENTRIES,
  R279_ROAD_EXCHANGE_EXPECTATION,
  ROAD_KEEPER_DIALOGUE_FILE,
  ROAD_KEEPER_NPC,
  ROAD_KEEPER_NPC_FILE,
  repairGraphEdgesRaw,
  repairGraphNodesRaw,
  repairManifestRaw,
  repairRegionGuideSourceRaw,
  repairWorldMapRaw,
  staticResourceState,
} from './lib/round279-road-exchange.mjs';
// Resolve against this script so the runner works from any cwd; preflight
// every repair and static file (including the post-write self-check) before
// a single byte is written. Engine-level parse/assembly checks live in the
// vitest suite (bare node cannot load the TS engine graph).

const paths = {
  cloudMap: '../data/base/maps/round-74-cloud-ridge.json',
  world: '../data/base/world/world-map.json',
  guideSource: '../scripts/lib/round106-region-content.mjs',
  graphNodes: '../data/base/knowledge_graph/nodes.json',
  graphEdges: '../data/base/knowledge_graph/edges.json',
  manifest: '../data/base/manifest.json',
  npcFile: '../data/base/characters/round-279-iron-ridge-npcs.json',
  dialogueFile: '../data/base/dialogues/round-279-road-keeper-conversations.json',
};
const url = (path) => new URL(path, import.meta.url);
const readOptional = (path) => (existsSync(url(path)) ? readFileSync(url(path), 'utf8') : undefined);

const raw = {
  cloudMap: readFileSync(url(paths.cloudMap), 'utf8'),
  world: readFileSync(url(paths.world), 'utf8'),
  guideSource: readFileSync(url(paths.guideSource), 'utf8'),
  graphNodes: readFileSync(url(paths.graphNodes), 'utf8'),
  graphEdges: readFileSync(url(paths.graphEdges), 'utf8'),
  manifest: readFileSync(url(paths.manifest), 'utf8'),
};
const npcExisting = readOptional(paths.npcFile);
const dialogueExisting = readOptional(paths.dialogueFile);

// Entire batch computes and validates first; any throw leaves all files as-is.
const next = {
  cloudMap: repairCloudSignArtRaw(raw.cloudMap, JSON.parse(repairWorldMapRaw(raw.world))),
  world: repairWorldMapRaw(raw.world),
  guideSource: repairRegionGuideSourceRaw(raw.guideSource),
  graphNodes: repairGraphNodesRaw(raw.graphNodes),
  graphEdges: repairGraphEdgesRaw(raw.graphEdges),
  manifest: repairManifestRaw(raw.manifest),
};
const npcState = staticResourceState(npcExisting, ROAD_KEEPER_NPC_FILE, '新人物文件');
const dialogueState = staticResourceState(dialogueExisting, ROAD_KEEPER_DIALOGUE_FILE, '新对白文件');

// Post-write self-check over the fully planned batch.
const worldDoc = JSON.parse(next.world);
const landmark = worldDoc.landmarks.filter((entry) => entry.id === FORK_SIGN_LANDMARK.id);
if (landmark.length !== 1 || landmark[0].col !== R279_ROAD_EXCHANGE_EXPECTATION.forkSignCell.col || landmark[0].row !== R279_ROAD_EXCHANGE_EXPECTATION.forkSignCell.row) {
  throw new Error('round279 自检失败：岔口地标形状不对');
}
const event = worldDoc.events.filter((entry) => entry.id === FORK_SIGN_EVENT.id);
if (event.length !== 1 || event[0].interaction === undefined || event[0].once !== FORK_SIGN_EVENT.once) {
  throw new Error('round279 自检失败：岔口事件形状不对');
}
const guide = worldDoc.regionGuides.find((entry) => entry.mapResourceId === 'map.round-74-cloud-ridge');
if (guide.advice !== CLOUD_ADVICE_AFTER || !guide.advice.includes(R279_ROAD_EXCHANGE_EXPECTATION.adviceFragment)) {
  throw new Error('round279 自检失败：云岭行旅指南未含岔路说明');
}
if (!next.guideSource.includes(CLOUD_ADVICE_AFTER)) {
  throw new Error('round279 自检失败：round106 canonical 源与数据指南不同步');
}
const nodesDoc = JSON.parse(next.graphNodes);
if (nodesDoc.nodes.filter((entry) => entry.id === GRAPH_NODE.id).length !== 1) {
  throw new Error('round279 自检失败：图谱人物节点数量不对');
}
const edgesDoc = JSON.parse(next.graphEdges);
for (const edge of GRAPH_EDGES) {
  if (edgesDoc.edges.filter((entry) => entry.id === edge.id).length !== 1) {
    throw new Error(`round279 自检失败：图谱边 ${edge.id} 数量不对`);
  }
}
const manifestDoc = JSON.parse(next.manifest);
for (const entry of MANIFEST_ENTRIES) {
  if (manifestDoc.resources.filter((resource) => resource.id === entry.id).length !== 1) {
    throw new Error(`round279 自检失败：manifest 条目 ${entry.id} 数量不对`);
  }
}
JSON.parse(ROAD_KEEPER_NPC_FILE);
JSON.parse(ROAD_KEEPER_DIALOGUE_FILE);

// All preflights passed — commit the batch.
for (const [key, value] of Object.entries(next)) {
  if (raw[key] !== value) writeFileSync(url(paths[key]), value);
}
if (!npcState.present) writeFileSync(url(paths.npcFile), ROAD_KEEPER_NPC_FILE);
if (!dialogueState.present) writeFileSync(url(paths.dialogueFile), ROAD_KEEPER_DIALOGUE_FILE);
console.log('Round279：铁嶂北行实际路(4,7→4,3→50,3)中段(26,3)旁格(26,4)添药队留守人辛当归（复用石北已授权像素帧），清心丸1或熟铁砂1二选一换回春膏1另耗8世界分钟，一次为限、确认页默认取消、整批原子；云岭岔口前(50,59)添可E读指路牌（先折西40列再北行客舍，不删缩地形不虚构捷径），云岭行旅指南同步并保持round106源一致；新增图谱人物与关系，旧38人物/56关口/旧事件全值保留。');
