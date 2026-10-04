import { readFileSync, writeFileSync } from 'node:fs';
import { repairWorldRaw, repairRegionSourceRaw, repairArrivalRaw } from './lib/round275-cloud-arrival.mjs';
const inputs = [
  ['../data/base/world/world-map.json', repairWorldRaw],
  ['./lib/round106-region-content.mjs', repairRegionSourceRaw],
  ['../data/base/dialogues/round-74-cloud-ridge-conversations.json', repairArrivalRaw],
];
const outputs = inputs.map(([path, repair]) => {
  const url = new URL(path, import.meta.url);
  const raw = readFileSync(url, 'utf8');
  const next = repair(raw);
  if (repair(next) !== next) throw Error('作者不幂等，请人工复核');
  return { url, raw, next };
});
for (const { url, raw, next } of outputs) if (raw !== next) writeFileSync(url, next);
console.log('Round275：真实两关上山路线、入境目标与云岭两侧无奖复谈；保留已有调查/商铺/关口规则。');
