import { readFileSync, writeFileSync } from 'node:fs';
import {
  R278_SHORE_BOAT_EXPECTATION,
  repairDialoguesRaw,
  repairRegionGuideSourceRaw,
  repairWorldMapRaw,
  SHORE_BOAT_TRANSITIONS,
} from './lib/round278-shore-boat.mjs';
// Resolve against this script so the runner works from any cwd; preflight
// every repair (including the post-write self-check) before files are written.
// Engine-level parseWorldMap/assembly checks live in the vitest suite (bare
// node cannot load the TS engine graph).

const paths = {
  world: '../data/base/world/world-map.json',
  guideSource: '../scripts/lib/round106-region-content.mjs',
  dialogues: '../data/base/dialogues/round-30-conversations.json',
};
const raw = {};
for (const [key, path] of Object.entries(paths)) raw[key] = readFileSync(new URL(path, import.meta.url), 'utf8');

const worldNext = repairWorldMapRaw(raw.world);
const guideSourceNext = repairRegionGuideSourceRaw(raw.guideSource);
const dialogueNext = repairDialoguesRaw(raw.dialogues);

// Post-write self-check: both gates carry the managed shape (same-map priced
// transitions follow the Round 123 precedent; the vitest suite re-checks via
// the real engine parser and assembler).
const doc = JSON.parse(worldNext);
for (const gate of SHORE_BOAT_TRANSITIONS) {
  const found = doc.transitions.filter((entry) => entry.id === gate.id);
  if (found.length !== 1) throw new Error(`round278 自检失败：关口 ${gate.id} 数量不对`);
  if (found[0].from.mapResourceId !== found[0].to.mapResourceId ||
      found[0].fare !== R278_SHORE_BOAT_EXPECTATION.fare ||
      found[0].travelMinutes !== R278_SHORE_BOAT_EXPECTATION.travelMinutes) {
    throw new Error(`round278 自检失败：关口 ${gate.id} 形状不对`);
  }
}
const advice = doc.regionGuides.find((entry) => entry.mapResourceId === R278_SHORE_BOAT_EXPECTATION.mapResourceId).advice;
if (!advice.includes(R278_SHORE_BOAT_EXPECTATION.adviceFragment)) {
  throw new Error('round278 自检失败：行旅指南缺少驿舟说明');
}
if (!guideSourceNext.includes(advice)) {
  throw new Error('round278 自检失败：round106 canonical 源与数据指南不同步');
}
JSON.parse(dialogueNext);

for (const [key, path] of Object.entries(paths)) {
  const next = { world: worldNext, guideSource: guideSourceNext, dialogues: dialogueNext }[key];
  if (raw[key] !== next) writeFileSync(new URL(path, import.meta.url), next);
}
console.log('Round278：渡口芦岸登船点北侧(0,3)⇄北岸水尺旁(87,15)/回程(87,16)⇄(0,4) 付费同图驿舟（各8银/20分钟，复用通用关口确认/预检，不直达云岭、不跳铁嶂），免费步行与水尺见闻保留；行旅指南等长改写并同步 round106 源；白鹭洲对白加纯提示。');
