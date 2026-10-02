/**
 * Round 130: 柳听澜/沈墨涵寒山实践简报 —— 纯作者新增、事实核对与跨轮重放回归。
 *
 * 副页留白（quest.r43-hanshan-copybook）是有序三段差事，但既有导师话不含
 * 坐标、关口分钟与气候成本，也从未区分「旧知回填」与「本轮实地再访」
 * （discoverKnowledge 目标 place.r93-old-mark 可能已知：旧知识会自动补齐目标，
 * 本轮实访另行记录，不能冒充新发现），纸龄与碑龄两笔账也只在沈的一段里。本轮
 * 给两个对话各加一个保留无效果方向节点，全部引用经装配数据核实的当前
 * 事实：沈 (45,37)、界标 (24,32) 与完整关口链（渡北(89,15)→铁嶂(4,7)→
 * (50,2)云岭→(62,2)台地(50,97)→(50,2)北隘(50,97)→(3,64)霜松谷东口
 * (96,50)）、五关各45分钟、步行1分钟/格+落雪2/轻雾1/晴0、刘复命
 * (48,43)/午(49,43)、寒山入门实数（等级1/悟性8/善恶5/关系5/声望无门槛）。
 * 以下验证：纯无效果、事实与装配数据逐一相符、整体解析与引用装配零新
 * 警告、幂等与漂移矩阵、runner cwd 无关/坏输入不落盘、以及固定基线
 * d3dcfe1 出发的 R128→R129→R130→R103/R127 跨轮重放保全。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { assembleDialogueReferences } from '../src/engine/dialogue-runtime';
import { parseQuestSet } from '../src/engine/quest-system';
import { addHanshanBriefs, HANSHAN_BRIEF_IDS } from '../scripts/lib/round130-hanshan-practice-brief.mjs';
import { addTransferDirections } from '../scripts/lib/round127-transfer-directions.mjs';
import { repairRound03Raw, repairRound30Raw } from '../scripts/lib/round128-aid-donation.mjs';
import { addIronPracticeBriefs } from '../scripts/lib/round129-iron-practice-brief.mjs';
import { applyRelayWaitingDirections } from '../scripts/lib/round133-relay-directions.mjs';
import { applyCompanionTrust } from '../scripts/lib/round131-companion-trust.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const BASELINE = 'd3dcfe1'; // The fixed round-129 commit, never mutable HEAD.

const BRIEFS = [
  { file: 'round-03', dialogueId: 'dlg.shen-mohan-bookshop', nodeId: 'r130-hanshan-paper-route' },
  { file: 'round-30', dialogueId: 'dlg.liu-tinglan-mentor', nodeId: 'r130-hanshan-practice-brief' },
] as const;

type NodeShape = { id: string; text: string; options?: unknown[]; effects?: unknown[]; conditions?: unknown[] };

describe('Round130 Hanshan practice briefs (real assembled data)', () => {
  it('both reserved nodes exist, hang on greet, and carry no mechanics', () => {
    for (const brief of BRIEFS) {
      const set = read(`data/base/dialogues/${brief.file}-conversations.json`) as never as { conversations: { id: string; nodes: NodeShape[] }[] };
      const conversation = set.conversations.find(entry => entry.id === brief.dialogueId)!;
      const node = conversation.nodes.find(entry => entry.id === brief.nodeId)!;
      expect(node).toBeDefined();
      expect(node.effects).toBeUndefined();
      expect(node.conditions).toBeUndefined();
      expect(node.options).toBeUndefined();
      const greet = conversation.nodes.find(entry => entry.id === 'greet')!;
      const option = greet.options?.find(candidate => (candidate as { nextNodeId: string }).nextNodeId === brief.nodeId);
      expect(option).toBeDefined();
      expect(Object.keys(option!).sort()).toEqual(['nextNodeId', 'text']);
    }
  });

  it('the brief text quotes exact current world facts and the epistemic boundary', () => {
    const shen = briefText('round-03', 'dlg.shen-mohan-bookshop', 'r130-hanshan-paper-route');
    // Shen speaks at his own stall — no self-cell needed; his brief is the
    // northbound route and the epistemic rules.
    expect(shen).toContain('(24,32)');
    for (const cell of ['(89,15)', '(4,7)', '(50,2)', '(62,2)', '(50,97)', '(3,64)', '(96,50)']) expect(shen).toContain(cell);
    expect(shen).toContain('五处关口');
    expect(shen).toContain('45分钟');
    expect(shen).toContain('225分钟');
    expect(shen).toContain('共六关270分钟');
    expect(shen).toContain('无需再次触发见闻');
    expect(shen).toContain('落雪每格再加2分钟');
    expect(shen).toContain('轻雾加1分钟');
    expect(shen).toContain('旧账回填');
    expect(shen).toContain('本轮亲眼核看');
    const liu = briefText('round-30', 'dlg.liu-tinglan-mentor', 'r130-hanshan-practice-brief');
    expect(liu).toContain('副页留白');
    expect(liu).toContain('Q日志只认当前这一步');
    expect(liu).toContain('回填与新访各记各的');
    expect(liu).toContain('碑上的年头是立碑的年头');
    expect(liu).toContain('拿界刻断纸龄，断不得');
    expect(liu).toContain('(48,43)');
    expect(liu).toContain('(49,43)');
    expect(liu).toContain('等级1、悟性8、善恶5、与我关系5');
    expect(liu).toContain('入门后可接这门实践');
    expect(liu).not.toContain('拜师前');
  });

  it('every quoted fact is re-verified against the assembled world data', () => {
    const npcs = read('data/base/characters/round-03-npcs.json') as { npcs: { id: string; mapResourceId: string; position: { col: number; row: number }; schedule: { periodId: string; position: { col: number; row: number } }[] }[] };
    const shen = npcs.npcs.find(entry => entry.id === 'char.shen-mohan')!;
    expect([shen.position.col, shen.position.row]).toEqual([45, 37]);
    expect(shen.schedule.find(slot => slot.periodId === 'period.midday')!.position).toEqual({ col: 45, row: 37 });
    const liu = npcs.npcs.find(entry => entry.id === 'char.liu-tinglan')!;
    expect([liu.position.col, liu.position.row]).toEqual([48, 43]);
    expect(liu.schedule.find(slot => slot.periodId === 'period.midday')!.position).toEqual({ col: 49, row: 43 });
    expect(liu.schedule.find(slot => slot.periodId === 'period.dusk')!.position).toEqual({ col: 48, row: 43 });
    const world = read('data/base/world/world-map.json') as { events: { id: string; mapResourceId: string; col: number; row: number; once?: boolean; discoverKnowledgeNodeId?: string }[]; transitions: { id: string; from: { mapResourceId: string; col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }[] };
    const mark = world.events.find(entry => entry.discoverKnowledgeNodeId === 'place.r93-old-mark')!;
    expect([mark.col, mark.row]).toEqual([24, 32]);
    expect(mark.once).toBe(true);
    const gate = (id: string) => world.transitions.find(entry => entry.id === id)!;
    expect(gate('gate.ferry-north-to-iron-ridge').from).toMatchObject({ col: 89, row: 15 });
    expect(gate('gate.ferry-north-to-iron-ridge').to).toMatchObject({ col: 4, row: 7 });
    expect(gate('gate.iron-ridge-to-cloud-ridge').from).toMatchObject({ col: 50, row: 2 });
    expect(gate('gate.r91-cloud-ridge-to-terrace').from).toMatchObject({ col: 62, row: 2 });
    expect(gate('gate.r91-cloud-ridge-to-terrace').to).toMatchObject({ col: 50, row: 97 });
    expect(gate('gate.r92-terrace-to-north-pass').from).toMatchObject({ col: 50, row: 2 });
    expect(gate('gate.r92-terrace-to-north-pass').to).toMatchObject({ col: 50, row: 97 });
    expect(gate('gate.r93-north-pass-to-valley').from).toMatchObject({ col: 3, row: 64 });
    expect(gate('gate.r93-north-pass-to-valley').to).toMatchObject({ col: 96, row: 50 });
    const calendar = read('data/base/worldview/calendar.json') as { actionCosts: { stepMinutes: number; travelMinutes: number } };
    expect(calendar.actionCosts).toMatchObject({ stepMinutes: 1, travelMinutes: 45 });
    const climate = read('data/base/worldview/climate.json') as { weathers: { id: string; stepMinutes?: number }[] };
    expect(climate.weathers.find(entry => entry.id === 'weather.snow')!.stepMinutes).toBe(2);
    expect(climate.weathers.find(entry => entry.id === 'weather.mist')!.stepMinutes).toBe(1);
    expect(climate.weathers.find(entry => entry.id === 'weather.clear')!.stepMinutes).toBe(0);
    const factions = read('data/base/factions/round-04-factions.json') as { factions: { id: string; mentorNpcIds: string[]; admission: { minimumLevel: number; minimumAttributes: { insight: number }; minimumMorality: number; minimumRenown: number; minimumTeacherRelationship: number; requiredQuestIds: string[] } }[] };
    const hanshan = factions.factions.find(entry => entry.id === 'faction.hanshan-shuyuan')!;
    expect(hanshan.mentorNpcIds).toContain('char.liu-tinglan');
    expect(hanshan.admission).toEqual({ minimumLevel: 1, minimumAttributes: { insight: 8 }, minimumMorality: 5, minimumRenown: 0, minimumTeacherRelationship: 5, requiredQuestIds: [] });
    const questParse = parseQuestSet(read('data/base/quests/round-07-quests.json'));
    if (!questParse.ok) throw Error(questParse.errors.join('\n'));
    const quest = questParse.set.quests.find(entry => entry.id === 'quest.r43-hanshan-copybook')!;
    expect(quest.orderedObjectives).toBe(true);
    expect(quest.objectives[1]!.targetId).toBe('place.r93-old-mark'); // Historical knowledge may satisfy it.
  });

  it('both dialogue sets parse and assemble without warnings naming the new nodes', () => {
    for (const file of ['round-03', 'round-30']) {
      const parsed = parseDialogueSet(read(`data/base/dialogues/${file}-conversations.json`));
      expect(parsed.ok).toBe(true);
    }
    const parsed03 = parseDialogueSet(read('data/base/dialogues/round-03-conversations.json'));
    if (!parsed03.ok) throw Error(parsed03.errors.join('\n'));
    const questParse = parseQuestSet(read('data/base/quests/round-07-quests.json'));
    if (!questParse.ok) throw Error(questParse.errors.join('\n'));
    const references = assembleDialogueReferences({
      conversations: new Map(parsed03.set.conversations.map(entry => [entry.id, entry])),
      quests: new Map(questParse.set.quests.map(entry => [entry.id, entry])),
      items: new Map(),
      placedNpcIds: new Set(['char.shen-mohan', 'char.liu-tinglan', 'char.shi-bei', 'char.gu-yechen']),
      knowledgeNodeIds: new Set(['event.r43-wayfarer-letter', 'event.r103-hanshan-practice', 'event.r43-hanshan-copybook', 'place.r93-old-mark', 'char.gu-yechen']),
      factionIds: new Set(['faction.hanshan-shuyuan', 'faction.tiezhang-pai']),
      martialArtIds: new Set(),
      timeOfDayPeriodIds: new Set(['period.midday', 'period.dusk']),
    });
    expect(references.warnings.filter(warning => HANSHAN_BRIEF_IDS.some(id => warning.includes(id)))).toEqual([]);
  });

  it('is idempotent on both files and supports LF and CRLF byte conventions', () => {
    for (const brief of BRIEFS) {
      const raw = readFileSync(join(root, `data/base/dialogues/${brief.file}-conversations.json`), 'utf8');
      expect(addHanshanBriefs(raw, brief.file)).toBe(raw); // Idempotent at the shipped convention.
      // A Windows checkout materializes CRLF via autocrlf and back — both
      // are normal; round-trip to each convention stays idempotent.
      const crlf = raw.replace(/\r?\n/g, '\r\n');
      expect(addHanshanBriefs(crlf, brief.file)).toBe(crlf);
      const lf = crlf.replace(/\r\n/g, '\n');
      expect(addHanshanBriefs(lf, brief.file)).toBe(lf);
    }
    expect(() => addHanshanBriefs('{}', 'round-03' as never)).toThrow();
  });

  it('refuses every drifted applied-state shape without touching the input', () => {
    const raw = readFileSync(join(root, 'data/base/dialogues/round-30-conversations.json'), 'utf8');
    // Node without its link.
    expect(() => addHanshanBriefs(raw.replace('"nextNodeId": "r130-hanshan-practice-brief"', '"nextNodeId": "r130-x"'), 'round-30')).toThrow();
    // Duplicate links.
    const duplicate = raw.replace('"nextNodeId": "r130-hanshan-practice-brief"', '"nextNodeId": "r130-hanshan-practice-brief"\n            },\n            {\n              "text": "再问。",\n              "nextNodeId": "r130-hanshan-practice-brief"');
    expect(() => addHanshanBriefs(duplicate, 'round-30')).toThrow();
    // Changed node text.
    expect(() => addHanshanBriefs(raw.replace('三步有先后', '三步没有先后'), 'round-30')).toThrow();
    // Changed option text.
    expect(() => addHanshanBriefs(raw.replace('副页这一程，请先生把路和证据边界说全。', '随便说说。'), 'round-30')).toThrow();
    // Foreign node: id present but not in the owning conversation.
    const foreign = raw.replace(`"id": "r130-hanshan-practice-brief"`, `"id": "r130-hanshan-practice-brief-foreign"`);
    expect(() => addHanshanBriefs(foreign, 'round-30')).toThrow();
    // Same drift family on the Shen side.
    const raw03 = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    expect(() => addHanshanBriefs(raw03.replace('纸验过了', '纸没验过'), 'round-03')).toThrow();
  });

  it('rejects semantic effects, conditions, hidden links and root ownership drift in both files', () => {
    for (const brief of BRIEFS) {
      const raw = readFileSync(join(root, `data/base/dialogues/${brief.file}-conversations.json`), 'utf8');
      for (const mutate of [
        (_set: any, _c: any, node: any) => { node.effects = []; },
        (_set: any, _c: any, node: any) => { node.conditions = []; },
        (_set: any, _c: any, node: any) => { node.options = []; },
        (_set: any, _c: any, node: any) => { node.unknown = true; },
        (_set: any, c: any) => { c.startNodeId = 'bye'; },
        (_set: any, _c: any, _node: any, option: any) => { option.effects = []; },
        (_set: any, _c: any, _node: any, option: any) => { option.conditions = []; },
        (_set: any, c: any, node: any, option: any) => {
          c.nodes.find((n: any) => n.id === 'greet').options = c.nodes.find((n: any) => n.id === 'greet').options.filter((o: any) => o !== option);
          node.options = [option];
        },
        (set: any, c: any, _node: any, option: any) => {
          set.conversations.find((owner: any) => owner !== c).nodes[0].options = [option];
        },
      ]) {
        const set = JSON.parse(raw);
        const c = set.conversations.find((entry: any) => entry.id === brief.dialogueId);
        const node = c.nodes.find((entry: any) => entry.id === brief.nodeId);
        const option = c.nodes.find((entry: any) => entry.id === 'greet').options.find((entry: any) => entry.nextNodeId === brief.nodeId);
        mutate(set, c, node, option);
        expect(() => addHanshanBriefs(JSON.stringify(set, null, 2), brief.file)).toThrow();
      }
    }
  });

  it('the runner is cwd-independent, refuses invalid raw without mutation', async () => {
    const { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync: rf, writeFileSync: wf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve, sep, join: j } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const sandbox = resolve(mkdtempSync(j(tmpdir(), 'wuxia-r130-runner-')));
    const tmpRoot = resolve(tmpdir());
    try {
      mkdirSync(j(sandbox, 'scripts/lib'), { recursive: true });
      mkdirSync(j(sandbox, 'data/base/dialogues'), { recursive: true });
      for (const file of ['apply-round130.mjs', 'lib/round130-hanshan-practice-brief.mjs']) cpSync(j(root, 'scripts', file), j(sandbox, 'scripts', file));
      for (const name of ['round-03-conversations.json', 'round-30-conversations.json']) cpSync(j(root, 'data/base/dialogues', name), j(sandbox, 'data/base/dialogues', name));
      const out = execFileSync(process.execPath, [j(sandbox, 'scripts/apply-round130.mjs')], { cwd: tmpRoot, encoding: 'utf8' });
      expect(out).toContain('already applied; delta 0');
      // First input requires fresh insertion, second is invalid: preflight
      // must refuse before writing even the otherwise valid first file.
      const data03 = j(sandbox, 'data/base/dialogues/round-03-conversations.json');
      const fresh = JSON.parse(rf(data03, 'utf8'));
      const shen = fresh.conversations.find((c: any) => c.id === 'dlg.shen-mohan-bookshop');
      shen.nodes = shen.nodes.filter((n: any) => n.id !== 'r130-hanshan-paper-route');
      shen.nodes.find((n: any) => n.id === 'greet').options = shen.nodes.find((n: any) => n.id === 'greet').options.filter((o: any) => o.nextNodeId !== 'r130-hanshan-paper-route');
      const fresh03 = JSON.stringify(fresh, null, 2);
      wf(data03, fresh03);
      const data30 = j(sandbox, 'data/base/dialogues/round-30-conversations.json');
      const good = rf(data30, 'utf8');
      wf(data30, good.replace('三步有先后', '三步被改了'));
      let refused = false;
      try {
        execFileSync(process.execPath, [j(sandbox, 'scripts/apply-round130.mjs')], { cwd: tmpRoot, encoding: 'utf8' });
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
      expect(rf(data03, 'utf8')).toBe(fresh03);
      expect(rf(data30, 'utf8')).toContain('三步被改了'); // Untouched by the refusal.
    } finally {
      // Recursive cleanup only after verifying the resolved path sits inside tmpdir.
      if (!sandbox.startsWith(tmpRoot + sep)) throw new Error('Unsafe temporary cleanup path');
      expect(sandbox.includes(j(tmpRoot, 'wuxia-r130-runner-'))).toBe(true);
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('cross-round replays from the fixed baseline keep every addition (R128→R129→R130→R103/R127)', async () => {
    const { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync: rf, writeFileSync: wf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve, sep, join: j } = await import('node:path');
    const { execFileSync, execSync } = await import('node:child_process');
    const sandbox = resolve(mkdtempSync(j(tmpdir(), 'wuxia-r130-chain-')));
    const tmpRoot = resolve(tmpdir());
    try {
      mkdirSync(j(sandbox, 'scripts/lib'), { recursive: true });
      mkdirSync(j(sandbox, 'data/base/dialogues'), { recursive: true });
      for (const file of ['apply-round130.mjs', 'lib/round130-hanshan-practice-brief.mjs', 'lib/round128-aid-donation.mjs', 'lib/round129-iron-practice-brief.mjs', 'lib/round127-transfer-directions.mjs', 'lib/round103-faction-practice.mjs']) {
        cpSync(j(root, 'scripts', file), j(sandbox, 'scripts', file));
      }
      // Fixed baseline: the round-129 commit's round-03 (R128+R129 applied, R130 absent).
      const head03 = execSync(`git show ${BASELINE}:data/base/dialogues/round-03-conversations.json`, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      wf(j(sandbox, 'data/base/dialogues/round-03-conversations.json'), head03);
      expect(head03).not.toContain('r130-hanshan-paper-route');
      // round-30 at baseline already carries R128's wicket link; R130 is absent.
      const head30 = execSync(`git show ${BASELINE}:data/base/dialogues/round-30-conversations.json`, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      wf(j(sandbox, 'data/base/dialogues/round-30-conversations.json'), head30);
      expect(head30).not.toContain('r130-hanshan-practice-brief');
      // Chain: R128 idempotent → R129 idempotent → R130 fresh → all stable.
      const probe = j(sandbox, 'scripts/chain.mjs');
      wf(probe, [
        `import { readFileSync, writeFileSync } from 'node:fs';`,
        `import { repairRound03Raw, repairRound30Raw } from './lib/round128-aid-donation.mjs';`,
        `import { addIronPracticeBriefs } from './lib/round129-iron-practice-brief.mjs';`,
        `import { addHanshanBriefs } from './lib/round130-hanshan-practice-brief.mjs';`,
        `for (const [name, file] of [['round-03-conversations.json','round-03'],['round-30-conversations.json','round-30']]) {`,
        `  const path = 'data/base/dialogues/' + name;`,
        `  let raw = readFileSync(path, 'utf8');`,
        `  if (file === 'round-03') raw = repairRound03Raw(addIronPracticeBriefs(repairRound03Raw(raw)));`,
        `  if (file === 'round-30') raw = repairRound30Raw(raw);`,
        `  raw = addHanshanBriefs(raw, file);`,
        `  writeFileSync(path, raw);`,
        `}`,
      ].join('\n'));
      execFileSync(process.execPath, [probe], { cwd: sandbox });
      const chained03 = rf(j(sandbox, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
      const chained30 = rf(j(sandbox, 'data/base/dialogues/round-30-conversations.json'), 'utf8');
      // R147 adds exactly two no-reward options and two terminal nodes.
      // Keep the historical replay compared against every other authored field.
      const current03 = JSON.parse(readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8'));
      const bookshop = current03.conversations.find((entry: { id: string }) => entry.id === 'dlg.shen-mohan-bookshop');
      expect(bookshop).toBeDefined();
      const variableNodeIds = new Set(['news-first', 'news-repeat']);
      expect(bookshop.nodes.filter((node: { id: string }) => variableNodeIds.has(node.id))).toHaveLength(2);
      bookshop.nodes = bookshop.nodes.filter((node: { id: string }) => !variableNodeIds.has(node.id));
      let removedOptions = 0;
      for (const node of bookshop.nodes) {
        if (!node.options) continue;
        removedOptions += node.options.filter((option: { nextNodeId: string }) => variableNodeIds.has(option.nextNodeId)).length;
        node.options = node.options.filter((option: { nextNodeId: string }) => !variableNodeIds.has(option.nextNodeId));
      }
      expect(removedOptions).toBe(2);
      expect(JSON.parse(applyRelayWaitingDirections(applyCompanionTrust(chained03)))).toEqual(current03);
      expect(chained30.replace(/\r\n/g, '\n')).toBe(readFileSync(join(root, 'data/base/dialogues/round-30-conversations.json'), 'utf8').replace(/\r\n/g, '\n'));
      expect(chained03).toContain('r130-hanshan-paper-route');
      expect(chained03).toContain('一份十五两、自购两份共三十两'); // R128 intact.
      expect(chained03).toContain('r129-tiezhang-practice-brief'); // R129 intact.
      expect(chained30).toContain('r130-hanshan-practice-brief');
      expect(chained30).toContain('r128-west-wicket'); // R128's Liu link intact.
      expect(repairRound03Raw(chained03)).toBe(chained03);
      expect(repairRound30Raw(chained30)).toBe(chained30);
      expect(addIronPracticeBriefs(chained03)).toBe(chained03);
      expect(addHanshanBriefs(chained03, 'round-03')).toBe(chained03);
      expect(addHanshanBriefs(chained30, 'round-30')).toBe(chained30);
      const combatAuthorPath = new URL('../scripts/lib/round107-combat-content.mjs', import.meta.url).href;
      const combatAuthor = await import(combatAuthorPath) as { deepenCombatRouteDialogues(raw: string): string };
      expect(combatAuthor.deepenCombatRouteDialogues(chained03)).toBe(chained03);
      // R103 patcher byte-stable over the chain; R127 object transform idempotent.
      wf(j(sandbox, 'scripts/r103.mjs'), [
        `import { readFileSync, writeFileSync } from 'node:fs';`,
        `import { patchFactionPracticeDialogues } from './lib/round103-faction-practice.mjs';`,
        `const path = 'data/base/dialogues/round-03-conversations.json';`,
        `const before = readFileSync(path, 'utf8');`,
        `const after = patchFactionPracticeDialogues(before);`,
        `if (after !== before) writeFileSync(path, after);`,
      ].join('\n'));
      execFileSync(process.execPath, [j(sandbox, 'scripts/r103.mjs')], { cwd: sandbox });
      expect(rf(j(sandbox, 'data/base/dialogues/round-03-conversations.json'), 'utf8')).toBe(chained03);
      const set = JSON.parse(chained03);
      expect(addTransferDirections(set)).toEqual(set);
    } finally {
      if (!sandbox.startsWith(tmpRoot + sep) || !sandbox.includes(j(tmpRoot, 'wuxia-r130-chain-'))) throw new Error('Unsafe temporary cleanup path');
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

function briefText(file: 'round-03' | 'round-30', dialogueId: string, nodeId: string): string {
  const set = read(`data/base/dialogues/${file}-conversations.json`) as never as { conversations: { id: string; nodes: NodeShape[] }[] };
  return set.conversations.find(entry => entry.id === dialogueId)!.nodes.find(entry => entry.id === nodeId)!.text;
}
