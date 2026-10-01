import { readFileSync, writeFileSync } from 'node:fs';
import { repairEastArrival } from './lib/round116-east-arrival.mjs';
import { PILOT_COST_HINT } from './lib/round102-sea-content.mjs';

const path = new URL('../data/base/world/world-map.json', import.meta.url);
const world = JSON.parse(readFileSync(path, 'utf8'));
writeFileSync(path, JSON.stringify(repairEastArrival(world), null, 2) + '\n');
console.log('天门关入场记录接入实际东脊过关，并保留旧踩格入口；其他资料保持。');
const dialoguePath = new URL('../data/base/dialogues/round-97-lanxin-reef-conversations.json', import.meta.url);
const dialogues = JSON.parse(readFileSync(dialoguePath, 'utf8'));
const node = dialogues.conversations.find(row => row.id === 'dlg.r97-ji-wuchao')?.nodes.find(row => row.id === 'r102-pilot-choice');
if (node === undefined) throw new Error('缺少传航成本选择节点，未更新对白。');
node.text = PILOT_COST_HINT;
writeFileSync(dialoguePath, JSON.stringify(dialogues, null, 2) + '\n');
console.log('传航对白明确两种真实成本与现有购买入口；选项规则保持。');
