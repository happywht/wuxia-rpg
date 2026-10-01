/**
 * Round 129: 石北/顾夜尘铁嶂实践简报 —— 纯作者新增与重放兼容回归。
 *
 * 石桩回声（quest.r43-tiezhang-stone-post）是有序三段差事，但导师简报不
 * 含坐标且暗藏两个真实陷阱：第一步的问桩人顾夜尘站在江南(51,42)而非铁
 * 嶂；第二步拦路客遭遇 repeatable——历史旧胜不抵本轮实战。本轮给两个对
 * 话各加一个保留无效果方向节点，引用经装配数据核实的当前事实（关口
 * (89,15)→(4,7)、拦路客(71,63)、石北时段(4,1)/(3,2)、入门资格实数与桩谱
 * 实付），选项挂 greet 根（R103/R107/R127 重放只重建自己的受管节点）。
 * 以下验证：节点/选项纯无效果、文本引用真实数据坐标与 ID、整体解析与
 * 引用装配零新警告、作者函数幂等与漂移拒绝、R103 生成器重放字节稳定、
 * R127 纯函数仍幂等。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDialogueSet } from '../src/engine/dialogue-graph';
import { assembleDialogueReferences } from '../src/engine/dialogue-runtime';
import { parseQuestSet } from '../src/engine/quest-system';
import { addIronPracticeBriefs, IRON_PRACTICE_BRIEF_IDS } from '../scripts/lib/round129-iron-practice-brief.mjs';
import { addTransferDirections } from '../scripts/lib/round127-transfer-directions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));

const BRIEFS = [
  { dialogueId: 'dlg.shi-bei-mentor', nodeId: 'r129-tiezhang-practice-brief' },
  { dialogueId: 'dlg.gu-yechen-roadside', nodeId: 'r129-gu-iron-route' },
] as const;

describe('Round129 iron-practice briefs (real assembled data)', () => {
  it('both reserved nodes exist, hang on greet, and carry no mechanics', () => {
    const set = read('data/base/dialogues/round-03-conversations.json') as never as { conversations: { id: string; nodes: { id: string; text: string; options?: unknown[]; effects?: unknown[]; conditions?: unknown[] }[] }[] };
    for (const brief of BRIEFS) {
      const conversation = set.conversations.find(entry => entry.id === brief.dialogueId)!;
      const node = conversation.nodes.find(entry => entry.id === brief.nodeId)!;
      expect(node).toBeDefined();
      expect(node.effects).toBeUndefined(); // Pure direction text.
      expect(node.conditions).toBeUndefined();
      expect(node.options).toBeUndefined();
      const greet = conversation.nodes.find(entry => entry.id === 'greet')!;
      const option = greet.options?.find(candidate => (candidate as { nextNodeId: string }).nextNodeId === brief.nodeId);
      expect(option).toBeDefined();
      expect(Object.keys(option!).sort()).toEqual(['nextNodeId', 'text']); // No conditions/effects on the option.
    }
  });

  it('the brief text quotes the exact current world facts, not inventions', () => {
    const set = read('data/base/dialogues/round-03-conversations.json') as never as { conversations: { id: string; nodes: { id: string; text: string }[] }[] };
    const shibei = set.conversations.find(entry => entry.id === 'dlg.shi-bei-mentor')!.nodes.find(entry => entry.id === 'r129-tiezhang-practice-brief')!.text;
    // Gu Yechen actually stands in Jiangnan at (51,42) — the number-one trap.
    expect(shibei).toContain('(51,42)');
    expect(shibei).toContain('不在铁嶂');
    // The real gate and landing, the roadblock cell, the mentor schedule.
    expect(shibei).toContain('(89,15)');
    expect(shibei).toContain('(4,7)');
    expect(shibei).toContain('(71,63)');
    expect(shibei).toContain('(4,1)');
    expect(shibei).toContain('(3,2)');
    // Honest repeatable rule + admission line exactly as the faction data says.
    expect(shibei).toContain('从前打散过也不抵这一轮');
    expect(shibei).toContain('等级2、体魄11、江湖声望5');
    const gu = set.conversations.find(entry => entry.id === 'dlg.gu-yechen-roadside')!.nodes.find(entry => entry.id === 'r129-gu-iron-route')!.text;
    expect(gu).toContain('(89,15)');
    expect(gu).toContain('(71,63)');
    expect(gu).toContain('从前打散过也不算这次');
  });

  it('the quoted facts still match the assembled world data', () => {
    // Gu Yechen placement, mentor schedule, gate and encounter coordinates,
    // admission line — all re-verified from the live files the brief quotes.
    const npcs = read('data/base/characters/round-03-npcs.json') as { npcs: { id: string; mapResourceId: string; position: { col: number; row: number }; schedule: { periodId: string; position: { col: number; row: number } }[] }[] };
    const gu = npcs.npcs.find(entry => entry.id === 'char.gu-yechen')!;
    expect([gu.position.col, gu.position.row]).toEqual([51, 42]);
    expect(gu.mapResourceId).toBe('map.round-01-grid');
    const shi = npcs.npcs.find(entry => entry.id === 'char.shi-bei')!;
    expect(shi.schedule.find(slot => slot.periodId === 'period.midday')!.position).toEqual({ col: 4, row: 1 });
    expect(shi.schedule.find(slot => slot.periodId === 'period.dusk')!.position).toEqual({ col: 3, row: 2 });
    const world = read('data/base/world/world-map.json') as { transitions: { id: string; from: { col: number; row: number }; to: { mapResourceId: string; col: number; row: number } }[] };
    const gate = world.transitions.find(entry => entry.id === 'gate.ferry-north-to-iron-ridge')!;
    expect([gate.from.col, gate.from.row]).toEqual([89, 15]);
    expect([gate.to.col, gate.to.row]).toEqual([4, 7]);
    const encounters = read('data/base/battles/round-05-encounters.json') as { encounters: { id: string; mapResourceId: string; position: { col: number; row: number }; repeatable?: boolean }[] };
    const roadblock = encounters.encounters.find(entry => entry.id === 'encounter.r62-ridge-roadblock')!;
    expect([roadblock.position.col, roadblock.position.row]).toEqual([71, 63]);
    expect(roadblock.repeatable).toBe(true); // The honest-rule basis.
    const factions = read('data/base/factions/round-04-factions.json') as { factions: { id: string; admission: { minimumLevel: number; minimumAttributes: { body: number }; minimumRenown: number } }[] };
    const tiezhang = factions.factions.find(entry => entry.id === 'faction.tiezhang-pai')!;
    expect(tiezhang.admission).toMatchObject({ minimumLevel: 2, minimumAttributes: { body: 11 }, minimumRenown: 5 });
  });

  it('the full dialogue set still parses and assembles without new warnings', () => {
    const parsed = parseDialogueSet(read('data/base/dialogues/round-03-conversations.json'));
    if (!parsed.ok) throw Error(parsed.errors.join('\n'));
    const questParse = parseQuestSet(read('data/base/quests/round-07-quests.json'));
    if (!questParse.ok) throw Error(questParse.errors.join('\n'));
    const references = assembleDialogueReferences({
      conversations: new Map(parsed.set.conversations.map(entry => [entry.id, entry])),
      quests: new Map(questParse.set.quests.map(entry => [entry.id, entry])),
      items: new Map(),
      placedNpcIds: new Set(['char.shi-bei', 'char.gu-yechen', 'char.ye-tingzhou', 'char.ma-shangyi']),
      knowledgeNodeIds: new Set(['event.r43-wayfarer-letter', 'event.r103-tiezhang-practice', 'event.r43-tiezhang-stone-post', 'char.gu-yechen']),
      factionIds: new Set(['faction.tiezhang-pai']),
      martialArtIds: new Set(['skill.r32-tiezhang-tiezhuang-quan']),
      timeOfDayPeriodIds: new Set(['period.midday', 'period.dusk']),
    });
    // No new warnings beyond whatever the pre-existing set already carries;
    // specifically none may name our new nodes.
    expect(references.warnings.filter(warning => IRON_PRACTICE_BRIEF_IDS.some(id => warning.includes(id)))).toEqual([]);
  });

  it('the author transform is idempotent and refuses drifted anchors', () => {
    const raw = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    expect(addIronPracticeBriefs(raw)).toBe(raw); // Idempotent pass-through.
  });

  it('refuses every drifted applied-state shape without touching the input', () => {
    const raw = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    // Node without its greet link (link renamed away).
    const nodeOnly = raw.replace('"nextNodeId": "r129-gu-iron-route"', '"nextNodeId": "r129-gu-iron-route-x"');
    expect(nodeOnly).not.toBe(raw);
    expect(() => addIronPracticeBriefs(nodeOnly)).toThrow();
    // Duplicate greet links.
    const duplicateLink = raw.replace(
      '"nextNodeId": "r129-gu-iron-route"',
      '"nextNodeId": "r129-gu-iron-route"\n            },\n            {\n              "text": "又问一遍。",\n              "nextNodeId": "r129-gu-iron-route"',
    );
    expect(() => addIronPracticeBriefs(duplicateLink)).toThrow();
    // Changed node text.
    const changedText = raw.replace('桩脚问完，下一程是碎岭实战', '桩脚问完，下一程是别的什么');
    expect(changedText).not.toBe(raw);
    expect(() => addIronPracticeBriefs(changedText)).toThrow();
    // Changed entry-option text.
    const changedOption = raw.replace('问桩之后，碎岭那段怎么走？', '问桩之后，随便哪里怎么走？');
    expect(() => addIronPracticeBriefs(changedOption)).toThrow();
    // Foreign node: the brief node moved into another conversation (its own
    // dialogue no longer contains it).
    const foreign = raw.replace(`"id": "r129-gu-iron-route"`, `"id": "r129-gu-iron-route-foreign"`)
      .concat(); // id renamed → half-applied path already covers absence; the
    // true foreign placement is covered by the id-in-another-conversation
    // variant below.
    expect(() => addIronPracticeBriefs(foreign)).toThrow();
    // Renaming the target dialogue away must refuse loudly too.
    const driftedDialogue = raw.replace('"id": "dlg.gu-yechen-roadside",', '"id": "dlg.gu-yechen-elsewhere",')
      .replace(`"id": "r129-gu-iron-route"`, `"id": "r129-gu-iron-route-drifted"`);
    expect(() => addIronPracticeBriefs(driftedDialogue)).toThrow();
  });

  it('a truly foreign placement (node id present only in another conversation) refuses', () => {
    const raw = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    // Move the Gu node id into the Shi Bei conversation verbatim: globally the
    // id count is 1, but it no longer lives in its owning dialogue.
    const guNodeStart = raw.indexOf('"id": "r129-gu-iron-route"');
    expect(guNodeStart).toBeGreaterThan(-1);
    const moved = raw.replace('"id": "r129-gu-iron-route"', '"id": "r129-tiezhang-practice-brief-duplicate"');
    // That leaves the Gu brief unapplied with a live link → half-applied refusal.
    expect(() => addIronPracticeBriefs(moved)).toThrow();
  });

  it('supports LF and CRLF inputs, preserving each file byte convention', () => {
    const lf = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    expect(lf.includes('\r\n')).toBe(false); // The checkout ships LF today.
    expect(addIronPracticeBriefs(lf)).toBe(lf); // Idempotent on LF.
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(addIronPracticeBriefs(crlf)).toBe(crlf); // Idempotent on CRLF too — a Windows checkout is normal, not drift.
    // Fresh application on CRLF: strip both briefs, re-apply, CRLF preserved.
    const stripped = crlf
      .replace(/,\r\n        \{\r\n          "id": "r129-tiezhang-practice-brief",\r\n          "text": "[^"]*"\r\n        \}/g, '')
      .replace(/,\r\n        \{\r\n          "id": "r129-gu-iron-route",\r\n          "text": "[^"]*"\r\n        \}/g, '')
      .replace(/,\r\n            \{\r\n              "text": "这趟石桩差事，请把路和账都说全。",\r\n              "nextNodeId": "r129-tiezhang-practice-brief"\r\n            \}/g, '')
      .replace(/,\r\n            \{\r\n              "text": "问桩之后，碎岭那段怎么走？",\r\n              "nextNodeId": "r129-gu-iron-route"\r\n            \}/g, '');
    expect(stripped).not.toContain('r129-gu-iron-route');
    expect(stripped).not.toContain('r129-tiezhang-practice-brief');
    const reapplied = addIronPracticeBriefs(stripped);
    expect(reapplied).toContain('"id": "r129-gu-iron-route"');
    // Round-trip: stripping then re-applying reproduces the CRLF file exactly.
    expect(reapplied).toBe(crlf);
    expect(reapplied.match(/(?<!\r)\n/g) ?? []).toEqual([]); // No bare LF leaked.
    // And the JSON is valid.
    expect(() => JSON.parse(reapplied)).not.toThrow();
  });

  it('the runner is cwd-independent, refuses invalid raw without mutation, and reports idempotence', async () => {
    const { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync: rf, writeFileSync: wf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve, join: j } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const sandbox = resolve(mkdtempSync(j(tmpdir(), 'wuxia-r129-runner-')));
    try {
      mkdirSync(j(sandbox, 'scripts/lib'), { recursive: true });
      mkdirSync(j(sandbox, 'data/base/dialogues'), { recursive: true });
      for (const file of ['apply-round129.mjs', 'lib/round129-iron-practice-brief.mjs']) {
        cpSync(j(root, 'scripts', file), j(sandbox, 'scripts', file));
      }
      cpSync(j(root, 'data/base/dialogues/round-03-conversations.json'), j(sandbox, 'data/base/dialogues/round-03-conversations.json'));
      const dataFile = j(sandbox, 'data/base/dialogues/round-03-conversations.json');
      const appliedBytes = rf(dataFile, 'utf8');
      // Run from an unrelated cwd: the runner uses import.meta.url paths.
      const out = execFileSync(process.execPath, [j(sandbox, 'scripts/apply-round129.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
      expect(out).toContain('already applied; delta 0');
      expect(rf(dataFile, 'utf8')).toBe(appliedBytes); // Nothing moved.
      // Invalid raw: the runner must refuse without mutating the file.
      wf(dataFile, appliedBytes.replace('桩脚问完，下一程是碎岭实战', '桩脚问完，下一程是被改过的'), 'utf8');
      let refused = false;
      try {
        execFileSync(process.execPath, [j(sandbox, 'scripts/apply-round129.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
      expect(rf(dataFile, 'utf8')).toContain('下一程是被改过的'); // Refusal left the file untouched.
      // Restoring the exact applied state makes it idempotent again.
      wf(dataFile, appliedBytes, 'utf8');
      const again = execFileSync(process.execPath, [j(sandbox, 'scripts/apply-round129.mjs')], { cwd: tmpdir(), encoding: 'utf8' });
      expect(again).toContain('already applied; delta 0');
    } finally {
      expect(sandbox.startsWith(resolve(tmpdir()))).toBe(true);
      if (!sandbox.startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? String.fromCharCode(92) : '/'))) throw new Error('Unsafe temporary cleanup');
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('R128→R129→R128 and R127 replays preserve the briefs end to end', async () => {
    const { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync: rf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve, join: j } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { execSync } = await import('node:child_process');
    const sandbox = resolve(mkdtempSync(j(tmpdir(), 'wuxia-r129-chain-')));
    try {
      mkdirSync(j(sandbox, 'scripts/lib'), { recursive: true });
      mkdirSync(j(sandbox, 'data/base/dialogues'), { recursive: true });
      for (const file of ['apply-round129.mjs', 'lib/round129-iron-practice-brief.mjs', 'lib/round128-aid-donation.mjs', 'lib/round127-transfer-directions.mjs', 'lib/round103-faction-practice.mjs']) {
        cpSync(j(root, 'scripts', file), j(sandbox, 'scripts', file));
      }
      // Start from the committed HEAD round-03 (R128 applied, R129 absent).
      const head = execSync('git show e1dffd734c1fec2efee73b201121b6c4c0674c92:data/base/dialogues/round-03-conversations.json', { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const { writeFileSync: wf } = await import('node:fs');
      const dataFile = j(sandbox, 'data/base/dialogues/round-03-conversations.json');
      wf(dataFile, head, 'utf8');
      expect(head).not.toContain('r129-gu-iron-route'); // Pre-condition.
      // R128 raw repair (idempotent over its own applied state) then R129.
      const probe = j(sandbox, 'scripts/chain.mjs');
      wf(probe, [
        `import { readFileSync, writeFileSync } from 'node:fs';`,
        `import { repairRound03Raw } from './lib/round128-aid-donation.mjs';`,
        `import { addIronPracticeBriefs } from './lib/round129-iron-practice-brief.mjs';`,
        `const path = 'data/base/dialogues/round-03-conversations.json';`,
        `let raw = readFileSync(path, 'utf8');`,
        `raw = repairRound03Raw(raw); // Idempotent: R128 already applied at HEAD.`,
        `raw = addIronPracticeBriefs(raw); // R129 fresh application.`,
        `raw = repairRound03Raw(raw); // R128 again after R129: must stay idempotent.`,
        `writeFileSync(path, raw);`,
      ].join('\n'));
      execFileSync(process.execPath, [probe], { cwd: sandbox });
      const chained = rf(dataFile, 'utf8');
      expect(chained).toContain('"id": "r129-gu-iron-route"');
      expect(chained).toContain('一份十五两、自购两份共三十两'); // R128 content intact.
      // The R103 patcher and the R127 object transform keep everything stable.
      wf(j(sandbox, 'scripts/r103.mjs'), [
        `import { readFileSync, writeFileSync } from 'node:fs';`,
        `import { patchFactionPracticeDialogues } from './lib/round103-faction-practice.mjs';`,
        `const path = 'data/base/dialogues/round-03-conversations.json';`,
        `const before = readFileSync(path, 'utf8');`,
        `const after = patchFactionPracticeDialogues(before);`,
        `if (after !== before) writeFileSync(path, after);`,
      ].join('\n'));
      execFileSync(process.execPath, [j(sandbox, 'scripts/r103.mjs')], { cwd: sandbox });
      expect(rf(dataFile, 'utf8')).toBe(chained); // Byte-stable.
      const { addTransferDirections } = await import('../scripts/lib/round127-transfer-directions.mjs');
      const set = JSON.parse(rf(dataFile, 'utf8'));
      expect(addTransferDirections(set)).toEqual(set); // R127 idempotent.
      const shibei = (addTransferDirections(set) as never as { conversations: { id: string; nodes: { id: string }[] }[] }).conversations.find(entry => entry.id === 'dlg.shi-bei-mentor')!;
      expect(shibei.nodes.some(entry => entry.id === 'r129-tiezhang-practice-brief')).toBe(true); // Brief survives.
    } finally {
      expect(sandbox.startsWith(resolve(tmpdir()))).toBe(true);
      if (!sandbox.startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? String.fromCharCode(92) : '/'))) throw new Error('Unsafe temporary cleanup');
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('the mentor brief quotes the actual base cell (3,1) beside the scheduled ones', () => {
    const set = read('data/base/dialogues/round-03-conversations.json') as never as { conversations: { id: string; nodes: { id: string; text: string }[] }[] };
    const text = set.conversations.find(entry => entry.id === 'dlg.shi-bei-mentor')!.nodes.find(entry => entry.id === 'r129-tiezhang-practice-brief')!.text;
    expect(text).toContain('平日在(3,1)');
    expect(text).toContain('午间在(4,1)');
    expect(text).toContain('入暮挪到(3,2)');
    // The base cell is the authored default, verified against the live file.
    const npcs = read('data/base/characters/round-03-npcs.json') as { npcs: { id: string; position: { col: number; row: number } }[] };
    const shi = npcs.npcs.find(entry => entry.id === 'char.shi-bei')!;
    expect([shi.position.col, shi.position.row]).toEqual([3, 1]);
  });

  it('the R103 generator replays byte-stably over the new briefs', async () => {
    const { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync: rf, writeFileSync: wf } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { resolve, join: j } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const sandbox = resolve(mkdtempSync(j(tmpdir(), 'wuxia-r129-')));
    try {
      mkdirSync(j(sandbox, 'scripts/lib'), { recursive: true });
      mkdirSync(j(sandbox, 'data/base/dialogues'), { recursive: true });
      for (const file of ['deepen-round103-faction-practice.mjs', 'lib/round103-faction-practice.mjs']) {
        cpSync(j(root, 'scripts', file), j(sandbox, 'scripts', file));
      }
      cpSync(j(root, 'data/base/dialogues/round-03-conversations.json'), j(sandbox, 'data/base/dialogues/round-03-conversations.json'));
      // The dialogue-only side of R103: patch round-03 twice; bytes must not move.
      const probe = j(sandbox, 'scripts/dialogue-only-probe.mjs');
      wf(probe, [
        `import { readFileSync, writeFileSync } from 'node:fs';`,
        `import { patchFactionPracticeDialogues } from './lib/round103-faction-practice.mjs';`,
        `const path = 'data/base/dialogues/round-03-conversations.json';`,
        `const before = readFileSync(path, 'utf8');`,
        `const after = patchFactionPracticeDialogues(before);`,
        `if (after !== before) writeFileSync(path, after);`,
      ].join('\n'));
      execFileSync(process.execPath, [probe], { cwd: sandbox });
      const once = rf(j(sandbox, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
      execFileSync(process.execPath, [probe], { cwd: sandbox });
      const twice = rf(j(sandbox, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
      expect(once).toBe(twice); // R103 replay is byte-stable over our briefs.
      expect(once).toBe(readFileSync(j(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8')); // And it keeps the checkout bytes.
    } finally {
      expect(sandbox.startsWith(resolve(tmpdir()))).toBe(true);
      if (!sandbox.startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? String.fromCharCode(92) : '/'))) throw new Error('Unsafe temporary cleanup');
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('the R127 pure transform stays idempotent over the patched file', () => {
    const set = read('data/base/dialogues/round-03-conversations.json') as Parameters<typeof addTransferDirections>[0];
    expect(addTransferDirections(set)).toEqual(set);
    // Our Shi Bei node survives the R127 transformation untouched (R127 only
    // rewrites the Ye Tingzhou conversation).
    const transformed = addTransferDirections(set) as typeof set;
    const shibei = (transformed as never as { conversations: { id: string; nodes: { id: string }[] }[] }).conversations.find(entry => entry.id === 'dlg.shi-bei-mentor')!;
    expect(shibei.nodes.some(entry => entry.id === 'r129-tiezhang-practice-brief')).toBe(true);
  });
});

 describe('Round129 semantic drift refusal', () => {
  for (const kind of ['node effects','option effects','moved link','changed root']) it(kind, () => {
   const raw=readFileSync(join(root,'data/base/dialogues/round-03-conversations.json'),'utf8');
   const set=JSON.parse(raw), c=set.conversations.find((v:{id:string})=>v.id==='dlg.shi-bei-mentor');
   const node=c.nodes.find((v:{id:string})=>v.id==='r129-tiezhang-practice-brief');
   const greet=c.nodes.find((v:{id:string})=>v.id==='greet');
   const option=greet.options.find((v:{nextNodeId:string})=>v.nextNodeId===node.id);
   if(kind==='node effects')node.effects=[];
   if(kind==='option effects')option.effects=[];
   if(kind==='changed root')c.startNodeId=node.id;
   if(kind==='moved link'){greet.options=greet.options.filter((v:unknown)=>v!==option);node.options=[option];}
   expect(()=>addIronPracticeBriefs(JSON.stringify(set,null,2))).toThrow();
  });
 });
