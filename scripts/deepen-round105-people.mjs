import { readFile, writeFile } from 'node:fs/promises';
import { people, stanceRules, deepenPeopleConversation, knowledgeNodes, knowledgeEdges } from './lib/round105-people-content.mjs';
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const write = async (path, value) => {
  const before = await readFile(new URL(path, root), 'utf8');
  const newline = before.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(new URL(path, root), (JSON.stringify(value, null, 2) + '\n').replace(/\n/g, newline));
};
for (const person of people) {
  const path = `data/base/dialogues/${person.file}`;
  let source = await readFile(new URL(path, root), 'utf8');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const conversation = JSON.parse(source).conversations.find(c => c.id === person.dialogueId);
  if (!conversation) throw new Error(`缺少人物对白 ${person.dialogueId}`);
  const anchor = source.indexOf(`"id": "${person.dialogueId}"`);
  const start = source.lastIndexOf('    {', anchor), end = source.indexOf(newline + '    }', anchor);
  if (start < 0 || end < 0) throw new Error(`人物对白边界无效 ${person.dialogueId}`);
  deepenPeopleConversation(conversation);
  const block = JSON.stringify(conversation, null, 2).split('\n').map(line => '    ' + line).join(newline);
  source = source.slice(0, start) + block + source.slice(end + newline.length + 5);
  JSON.parse(source);
  await writeFile(new URL(path, root), source);
}
const companionsPath = 'data/base/companions/round-19-companions.json';
const companions = await read(companionsPath);
const companion = companions.companions.find(c => c.id === 'companion.gu-yechen');
if (!companion) throw new Error('缺少既有同行伙伴');
companion.description = '默认每两次成功行动以9力援护；当面听过大陆/北境/海路的决定后，按当前代表地区改为正面援护或疗伤。未告知的事不替你判断。';
companion.stanceRules = stanceRules;
await write(companionsPath, companions);
const schemaPath = 'data/schema/companion-set.schema.json';
const schema = await read(schemaPath);
const supportSchema = structuredClone(schema.properties.companions.items.properties.combatSupport);
schema.definitions ??= {};
schema.definitions.stanceRule = {
  type: 'object', additionalProperties: false,
  required: ['id', 'label', 'description', 'requiredSharedKnowledgeNodeIds', 'combatSupport'],
  properties: {
    id: { type: 'string', pattern: '^stance\\.[A-Za-z0-9._-]+$' },
    label: { type: 'string', minLength: 1, maxLength: 40 },
    description: { type: 'string', minLength: 1, maxLength: 300 },
    mapResourceIds: { type: 'array', minItems: 1, maxItems: 64, uniqueItems: true, items: { type: 'string', pattern: '^map\\.[A-Za-z0-9._-]+$' } },
    requiredSharedKnowledgeNodeIds: { type: 'array', minItems: 1, maxItems: 64, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 96 } },
    combatSupport: supportSchema,
  },
};
schema.properties.companions.items.properties.stanceRules = { type: 'array', maxItems: 32, items: { $ref: '#/definitions/stanceRule' } };
await write(schemaPath, schema);
const upsert = (list, record) => {
  const index = list.findIndex(item => item.id === record.id);
  if (index < 0) list.push(record); else list[index] = record;
};
for (const [key, records] of [['nodes', knowledgeNodes], ['edges', knowledgeEdges]]) {
  const path = `data/base/knowledge_graph/${key}.json`, set = await read(path);
  for (const record of records) upsert(set[key], record);
  await write(path, set);
}
console.log('Round105：八人物三态、三组跨区转述、6见闻9边、已分享见闻驱动伙伴地域立场；原任务/地图/战斗基础值保持。');
