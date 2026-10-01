/**
 * Round 122: 有序差事当前阶段/就绪呈现 + 云隐备药价格对表 —— 纯层与 UI 回归。
 *
 * 阶段派生严格镜像 quest-system：ordered 的当前步是首个计数未达标目标，
 * 其前已完成、其后后续（越序旧档的陈旧计数绝不冒充当前阶段）；collect
 * 同时引用日志历史计数与实时背包（花掉的囤货不会被读成现持有）；无序
 * 差事诚实标 [并行]；非 active 保持朴素进度行。云隐实践简报按 authored
 * 物价（round-06 回春膏 15 两/份）写明一份十五两、自购两份共三十两、自
 * 备自用非捐赠；路线坐标逐字保留，任务 id/目标/奖励不动，其余门派零改动。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { createQuestJournal, parseQuestSet, type QuestData } from '../src/engine/quest-system';
import { activeQuestProgressLabel } from '../src/game/quest-presentation';
import { buildQuestDetailBlocks, buildQuestObjectiveStageLines, paginateQuestDetail } from '../src/game/quest-panel-layout';
import { repairYunyinPracticeBrief, YUNYIN_PRICE_ANCHOR_NEW } from '../scripts/lib/round122-yunyin-price.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), 'utf8'));
const measure = (text: string, px = 12): number => Array.from(text).reduce((sum, char) => sum + (/[一-鿿]/.test(char) ? px : px * 0.6), 0);

const orderedFixture = {
  id: 'q.ordered', name: '有序差事', description: '试描述', giverNpcId: 'n.a',
  prerequisiteQuestIds: [], orderedObjectives: true,
  objectives: [
    { id: 'o1', kind: 'talkToNpc', targetId: 'n.b', requiredCount: 1, text: '第一步问话' },
    { id: 'o2', kind: 'collectItem', targetId: 'item.x', requiredCount: 2, text: '第二步收两件物' },
    { id: 'o3', kind: 'discoverKnowledge', targetId: 'k.x', requiredCount: 1, text: '第三步查见闻' },
    { id: 'o4', kind: 'talkToNpc', targetId: 'n.c', requiredCount: 1, text: '第四步复命' },
  ],
  failOnEncounterIds: [], rewards: { experience: 1, currency: 1 },
} as unknown as QuestData;
const unorderedFixture = {
  ...orderedFixture, id: 'q.unordered', orderedObjectives: false,
  objectives: [
    { id: 'o1', kind: 'collectItem', targetId: 'item.x', requiredCount: 2, text: '并行收物' },
    { id: 'o2', kind: 'talkToNpc', targetId: 'n.b', requiredCount: 1, text: '并行问话' },
  ],
} as unknown as QuestData;

const activeJournal = (quest: QuestData) => {
  const journal = createQuestJournal(new Map([[quest.id, quest]]));
  journal.states.get(quest.id)!.status = 'active';
  return journal;
};

describe('Round122 ordered-stage presentation mirrors quest-system semantics', () => {
  it('marks done / current / later across the full sequential chain', () => {
    const quest = orderedFixture;
    const journal = activeJournal(quest);
    const state = journal.states.get(quest.id)!;
    state.objectiveCounts.set('o1', 1); // First step complete → o2 is current.
    const lines = buildQuestObjectiveStageLines({ quest, state });
    expect(lines[0]).toBe('[已完成] 第一步问话（记录 1/1）');
    expect(lines[1]).toBe('[当前] 目标 0/2：第二步收两件物'); // No live map: no inventory claim.
    expect(lines[1]).not.toContain('现持');
    expect(lines[2]).toBe('[后续] 第三步查见闻');
    expect(lines[3]).toBe('[后续] 第四步复命');
  });

  it('an out-of-order older save never masquerades as the current stage', () => {
    const quest = orderedFixture;
    const journal = activeJournal(quest);
    const state = journal.states.get(quest.id)!;
    state.objectiveCounts.set('o3', 1); // Stale future count while o1/o2 unfinished.
    const lines = buildQuestObjectiveStageLines({ quest, state });
    expect(lines[0]).toContain('[当前]');
    expect(lines[2]).toBe('[后续] 第三步查见闻'); // Still later despite the stale count.
    expect(lines.join('')).not.toContain('[已完成] 第三步');
  });

  it('a fully-counted active journal reads as all done', () => {
    const quest = orderedFixture;
    const journal = activeJournal(quest);
    const state = journal.states.get(quest.id)!;
    for (const objective of quest.objectives) state.objectiveCounts.set(objective.id, objective.requiredCount);
    expect(buildQuestObjectiveStageLines({ quest, state }).every(line => line.startsWith('[已完成]'))).toBe(true);
  });

  it('collect quotes live inventory beside the journal count — spent stock is not held stock', () => {
    const quest = orderedFixture;
    const journal = activeJournal(quest);
    const state = journal.states.get(quest.id)!;
    state.objectiveCounts.set('o1', 1);
    const spent = buildQuestObjectiveStageLines({ quest, state, liveItemCounts: new Map([['item.x', 0]]) });
    expect(spent[1]).toBe('[当前] 目标 0/2：第二步收两件物（现持 0/2，尚缺 2）');
    const restocked = buildQuestObjectiveStageLines({ quest, state, liveItemCounts: new Map([['item.x', 3]]) });
    expect(restocked[1]).toContain('（现持 3/2，尚缺 0）');
    // A historical journal count (already credited) never reads as currently held.
    state.objectiveCounts.set('o2', 2);
    state.objectiveCounts.set('o3', 0);
    const later = buildQuestObjectiveStageLines({ quest, state, liveItemCounts: new Map([['item.x', 0]]) });
    expect(later[1]).toBe('[已完成] 第二步收两件物（记录 2/2）（现持 0/2，尚缺 2）');
    expect(later[2]).toContain('[当前]');
  });

  it('unordered quests stay honestly simultaneous; non-active rows keep plain lines', () => {
    const quest = unorderedFixture;
    const journal = activeJournal(quest);
    const state = journal.states.get(quest.id)!;
    const lines = buildQuestObjectiveStageLines({ quest, state, liveItemCounts: new Map([['item.x', 1]]) });
    expect(lines[0]).toBe('[并行] 目标 0/2：并行收物（现持 1/2，尚缺 1）');
    expect(lines[1]).toBe('[并行] 目标 0/1：并行问话');
    const offered = createQuestJournal(new Map([[quest.id, quest]])).states.get(quest.id)!;
    expect(buildQuestObjectiveStageLines({ quest, state: offered })[0]).toBe('目标 0/2：并行收物');
  });

  it('the staged body still paginates losslessly with long MOD text at max font', () => {
    const quest: QuestData = {
      ...orderedFixture, description: '长序考据'.repeat(300),
      objectives: orderedFixture.objectives.map(objective => ({ ...objective, text: `${objective.text}${'细节'.repeat(60)}` })),
    } as unknown as QuestData;
    const journal = activeJournal(quest);
    journal.states.get(quest.id)!.objectiveCounts.set('o1', 1); // Step one done → the collect step is current.
    const blocks = buildQuestDetailBlocks(quest, journal.states.get(quest.id), {}, new Map([['item.x', 1]]));
    const body = blocks.join('\n\n');
    expect(body).toContain('[当前]');
    expect(body).toContain('（现持 1/2，尚缺 1）');
    for (const objective of quest.objectives) expect(body).toContain(objective.text);
    const pages = paginateQuestDetail(blocks, 500, 3, (text) => measure(text, 12));
    const pagedLines = pages.flatMap(page => page.split('\n'));
    const allLines = paginateQuestDetail(blocks, 500, 9999, (text) => measure(text, 12))[0]!.split('\n');
    expect(pagedLines).toEqual(allLines);
  });
});

describe('Round122 Yunyin practice brief quotes the authored price exactly', () => {
  it('the JSON and the R103 source agree, and the price matches the item set', () => {
    const json = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    expect(json).toContain(YUNYIN_PRICE_ANCHOR_NEW);
    const source = readFileSync(join(root, 'scripts/lib/round103-faction-practice.mjs'), 'utf8');
    expect(source).toContain(YUNYIN_PRICE_ANCHOR_NEW);
    const items = read('data/base/items/round-06-items.json') as { items: { id: string; buyPrice: number }[] };
    const unit = items.items.find(item => item.id === 'item.huichun-gao')!.buyPrice;
    expect(unit).toBe(15);
    expect(YUNYIN_PRICE_ANCHOR_NEW).toContain(`一份十五两、自购两份共三十两`); // unit×2, derived from the set.
    // Self-supply, not a donation; the route coordinates stay verbatim.
    expect(YUNYIN_PRICE_ANCHOR_NEW).toContain('防身自用');
    expect(YUNYIN_PRICE_ANCHOR_NEW).toContain('庄中不收药');
  });

  it('the repaired brief keeps the verified route and every task fact untouched', () => {
    const json = readFileSync(join(root, 'data/base/dialogues/round-03-conversations.json'), 'utf8');
    for (const coordinate of ['(26,28)', '(89,15)', '(52,90)', '(95,74)']) expect(json).toContain(coordinate);
    const questFile = readFileSync(join(root, 'data/base/quests/round-07-quests.json'), 'utf8');
    expect(questFile).toContain('自备两份回春膏以防急用'); // Objective text untouched.
    const quests = parseQuestSet(read('data/base/quests/round-07-quests.json'));
    if (!quests.ok) throw Error(quests.errors.join('\n'));
    const herbRoad = quests.set.quests.find(quest => quest.id === 'quest.r43-yunyin-herb-road')!;
    expect(herbRoad.orderedObjectives).toBe(true);
    expect(herbRoad.rewards.currency).toBeGreaterThan(0);
  });

  it('repairs idempotently and refuses ambiguous anchor counts', () => {
    const dialogues = read('data/base/dialogues/round-03-conversations.json') as never;
    const once = repairYunyinPracticeBrief(dialogues);
    expect(repairYunyinPracticeBrief(once)).toEqual(once); // Idempotent.
    const conversations = once as { conversations: { nodes: { text?: string }[] }[] };
    expect(JSON.stringify(conversations)).toContain(YUNYIN_PRICE_ANCHOR_NEW);
    const anchorless = JSON.parse(JSON.stringify(conversations)) as typeof conversations;
    for (const conversation of anchorless.conversations) {
      for (const node of conversation.nodes) {
        if (typeof node.text === 'string' && node.text.includes(YUNYIN_PRICE_ANCHOR_NEW)) node.text = node.text.replace(YUNYIN_PRICE_ANCHOR_NEW, '别处');
      }
    }
    expect(() => repairYunyinPracticeBrief(anchorless as never)).toThrow();
    const doubled = JSON.parse(JSON.stringify(conversations)) as typeof conversations;
    doubled.conversations[0]!.nodes.push({ text: YUNYIN_PRICE_ANCHOR_NEW });
    expect(() => repairYunyinPracticeBrief(doubled as never)).toThrow();
  });
});

// ── UI lifecycle with the real ordered Yunyin errand (measured mock scene) ───
vi.mock('phaser', () => ({ default: { Input: { Keyboard: { KeyCodes: { UP: 1, W: 7, DOWN: 2, S: 8, ENTER: 3, N: 4, A: 5, ESC: 6, PAGE_UP: 33, PAGE_DOWN: 34 } } } } }));
vi.mock('../src/game/ui-theme', () => ({ addPixelPanelChrome: () => {}, addPixelSelection: () => {}, UI_FONT_FAMILY: 'monospace' }));
let fontScale = 1.6;
vi.mock('../src/game/settings', () => ({ uiFontSize: (n: number) => `${Math.max(8, Math.round(n * fontScale))}px` }));
import { QuestPanel } from '../src/game/quest-ui';

interface Shown { text: string; color: string; x: number; y: number; fontPx: number; lines: string[]; destroyed: boolean;
  get height (): number; setText (v: string): Shown; setOrigin (): Shown; setColor (): Shown; setVisible (): Shown; destroy (): void;
  context: { measureText: (s: string) => { width: number } }; }

describe('Round122 quest UI shows the live stage on the real Yunyin errand', () => {
  it('an active ordered errand renders [当前] with live inventory and pages', () => {
    fontScale = 1.6;
    const shown: Shown[] = [];
    const makeText = (x: number, y: number, text: string, style: { fontSize: string; color: string }): Shown => {
      const fontPx = Number.parseFloat(style.fontSize);
      const node = {
        x, y, text, fontPx, color: style.color, lines: text.split('\n'), destroyed: false,
        get height() { return this.lines.length * this.fontPx * 1.2 + 2; },
        setText(v: string) { this.text = v; this.lines = v.split('\n'); return this; },
        setOrigin() { return this; }, setColor() { return this; }, setVisible() { return this; },
        destroy() { this.destroyed = true; },
        context: { measureText: (s: string) => ({ width: measure(s, fontPx) }) },
      } as Shown;
      shown.push(node);
      return node;
    };
    const keys = new Map<number, Set<() => void>>();
    const container = { setDepth() { return this; }, setVisible() { return this; }, removeAll() { for (const t of shown) t.destroyed = true; return this; }, add() { return this; }, destroy() {} };
    const scene = {
      scale: { width: 640, height: 360 },
      input: { keyboard: { addKey(code: number) { if (!keys.has(code)) keys.set(code, new Set()); return { on(_e: string, fn: () => void) { keys.get(code)!.add(fn); }, off(_e: string, fn: () => void) { keys.get(code)!.delete(fn); } }; } } },
      add: { text: (x: number, y: number, text: string, style: { fontSize: string; color: string }) => makeText(x, y, text, style), container: () => container },
    } as unknown as Phaser.Scene;
    const panel = new QuestPanel(scene, {});
    const parse = parseQuestSet(read('data/base/quests/round-07-quests.json'));
    if (!parse.ok) throw Error(parse.errors.join('\n'));
    const herbRoad = parse.set.quests.find(quest => quest.id === 'quest.r43-yunyin-herb-road')!;
    const quests = new Map([[herbRoad.id, herbRoad]]);
    const journal = createQuestJournal(quests);
    const state = journal.states.get(herbRoad.id)!;
    state.status = 'active';
    for (const objective of herbRoad.objectives.slice(0, 2)) {
      state.objectiveCounts.set(objective.id, objective.requiredCount); // First two steps done → the collect step is current.
    }
    panel.open({
      quests, journal, itemCounts: new Map([['item.huichun-gao', 1]]),
      access: { factionId: null, knownKnowledgeNodeIds: new Set() },
    });
    const visible = () => shown.filter(t => !t.destroyed && t.text.length > 0 && t.x > -300);
    const press = (code: number) => { for (const fn of [...keys.get(code) ?? []]) fn(); };
    const pageHint = () => visible().find(t => /详情\d+\/\d+页/.test(t.text))?.text ?? '';
    const totalPages = Number.parseInt(pageHint().split('/')[1] ?? '1', 10);
    // Walk every detail page (the tiny band holds ~2 lines per page) and
    // collect the whole body before asserting the staged presentation.
    const bodyText = (t: Shown): boolean => !t.text.startsWith('▸') && !t.text.startsWith('  ') &&
      !t.text.includes('任务日志') && !t.text.includes('Esc') && !/详情\d+\/\d+页/.test(t.text) && !t.text.includes('自动更新');
    const whole: string[] = [];
    for (let page = 0; page < totalPages; page += 1) {
      whole.push(visible().filter(bodyText).map(t => t.text).join('\n'));
      press(34);
    }
    const allText = whole.join('\n').replace(/\n/g, '');
    expect(allText).toContain('[已完成]');
    expect(allText).toContain('[当前]');
    expect(allText).toContain('（现持 1/2，尚缺 1）');
    expect(allText).toContain('[后续]');
    press(6);
    expect(panel.isOpen).toBe(false);
    panel.destroy();
    fontScale = 1;
  });
});

describe('Round122 active list rows agree with the actual stage', () => {
  it('walks every sequential stage and handles fully counted active state', () => {
    const quest = orderedFixture;
    const state = activeJournal(quest).states.get(quest.id)!;
    for (const [index, objective] of quest.objectives.entries()) {
      expect(activeQuestProgressLabel(quest, state)).toBe(`第${index + 1}/4步 0/${objective.requiredCount}`);
      state.objectiveCounts.set(objective.id, objective.requiredCount);
    }
    expect(activeQuestProgressLabel(quest, state)).toBe('目标均已达成');
    state.status = 'completed';
    expect(activeQuestProgressLabel(quest, state)).toBe('');
  });
  it('summarizes concurrent completion without inventing an order', () => {
    const quest = unorderedFixture;
    const state = activeJournal(quest).states.get(quest.id)!;
    expect(activeQuestProgressLabel(quest, state)).toBe('已成0/2项');
    const objective = quest.objectives[1]!;
    state.objectiveCounts.set(objective.id, objective.requiredCount);
    expect(activeQuestProgressLabel(quest, state)).toBe('已成1/2项');
  });
});
