import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { addWeatherPatrol } from './lib/round141-weather-dialogue.mjs';
const file = resolve('data/base/dialogues/round-93-snow-pine-valley-conversations.json');
const data = JSON.parse(await readFile(file, 'utf8'));
for (const talk of data.conversations) addWeatherPatrol(talk);
await writeFile(file, JSON.stringify(data, null, 2) + '\n');
console.log('Round141天气巡路作者链已应用；无效果/奖励，拒绝覆盖已改动节点。');
